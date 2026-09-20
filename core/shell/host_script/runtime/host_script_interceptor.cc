// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "core/shell/host_script/runtime/host_script_interceptor.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <utility>

#include "base/include/log/logging.h"
#include "base/include/value/array.h"
#include "base/include/value/byte_array.h"
#include "base/include/value/table.h"

namespace lynx::shell {
namespace {
using Kind = pub::InterceptKind;
using Value = lepus::Value;

Napi::Function Function(
    Napi::Env env,
    std::function<Napi::Value(const Napi::CallbackInfo&)> callback) {
  using Callback = decltype(callback);
  auto* holder = new Callback(std::move(callback));
  auto function = Napi::Function::New(
      env,
      [](const Napi::CallbackInfo& info) {
        return (*static_cast<Callback*>(info.Data()))(info);
      },
      nullptr, holder);
  function.AddFinalizer(holder, [](napi_env, void* data, void*) {
    delete static_cast<Callback*>(data);
  });
  return function;
}

Napi::Value ToJS(Napi::Env env, const Value& value) {
  if (value.IsUndefined()) return env.Undefined();
  if (value.IsNil()) return env.Null();
  if (value.IsBool()) return Napi::Boolean::New(env, value.Bool());
  if (value.IsNumber()) return Napi::Number::New(env, value.Number());
  if (value.IsString()) return Napi::String::New(env, value.StdString());
  if (value.IsByteArray()) {
    auto bytes = value.ByteArray();
    auto result = Napi::ArrayBuffer::New(env, bytes->GetLength());
    memcpy(result.Data(), bytes->GetPtr(), bytes->GetLength());
    return result;
  }
  if (value.IsArray()) {
    auto result = Napi::Array::New(env, value.GetLength());
    for (int i = 0; i < value.GetLength(); ++i)
      result.Set(i, ToJS(env, value.GetProperty(static_cast<uint32_t>(i))));
    return result;
  }
  auto result = Napi::Object::New(env);
  if (value.IsTable()) {
    for (const auto& item : *value.Table())
      result.Set(item.first.c_str(), ToJS(env, item.second));
  }
  return result;
}

// Copy data between VMs without sharing JS references. Reject executable,
// cyclic and exotic objects instead of silently serializing them to {}.
bool FromJS(Napi::Value input, Value* output,
            std::vector<napi_value>& parents) {
  auto env = input.Env();
  if (env.IsExceptionPending() || parents.size() >= 64) return false;
  if (input.IsUndefined()) {
    *output = Value();
    output->SetUndefined();
  } else if (input.IsNull())
    *output = Value();
  else if (input.IsBoolean())
    *output = Value(input.As<Napi::Boolean>().Value());
  else if (input.IsNumber()) {
    double number = input.As<Napi::Number>().DoubleValue();
    if (!std::isfinite(number)) return false;
    *output = Value(number);
  } else if (input.IsString())
    *output = Value(input.As<Napi::String>().Utf8Value());
  else if (input.IsArrayBuffer()) {
    auto buffer = input.As<Napi::ArrayBuffer>();
    auto bytes = std::make_unique<uint8_t[]>(buffer.ByteLength());
    memcpy(bytes.get(), buffer.Data(), buffer.ByteLength());
    *output =
        Value(lepus::ByteArray::Create(std::move(bytes), buffer.ByteLength()));
  } else if (input.IsObject() && !input.IsFunction() && !input.IsPromise()) {
    for (auto parent : parents) {
      if (input.StrictEquals(Napi::Value(env, parent))) return false;
    }
    parents.push_back(input);
    auto object = input.As<Napi::Object>();
    if (input.IsArray()) {
      auto array = lepus::CArray::Create();
      uint32_t length = input.As<Napi::Array>().Length();
      for (uint32_t i = 0; i < length; ++i) {
        Value child;
        if (!FromJS(object.Get(i), &child, parents)) return false;
        array->push_back(std::move(child));
      }
      *output = Value(array);
    } else {
      // Only plain records (including null-prototype records) are supported.
      auto prototype = env.Global()
                           .Get("Object")
                           .As<Napi::Object>()
                           .Get("getPrototypeOf")
                           .As<Napi::Function>()
                           .Call({object});
      auto plain =
          env.Global().Get("Object").As<Napi::Object>().Get("prototype");
      if (!prototype.IsNull() && !prototype.StrictEquals(plain)) return false;
      auto table = lepus::Dictionary::Create();
      auto keys = object.GetPropertyNames();
      for (uint32_t i = 0; i < keys.Length(); ++i) {
        auto key = keys.Get(i).ToString().Utf8Value();
        Value child;
        if (!FromJS(object.Get(key.c_str()), &child, parents)) return false;
        table->SetValue(key, std::move(child));
      }
      *output = Value(table);
    }
    parents.pop_back();
  } else
    return false;
  return !env.IsExceptionPending();
}

bool IsData(const Value& value) { return value.IsNil() || value.IsTable(); }
bool ValidPatch(Kind kind, const Value& patch, const Value& original) {
  if (!patch.IsTable()) return false;
  for (const auto& item : *patch.Table()) {
    auto key = item.first.str();
    const auto& value = item.second;
    bool valid = false;
    switch (kind) {
      case Kind::kCreate:
        if (key == "fontScale") valid = value.IsNumber() && value.Number() > 0;
        if (key == "threadStrategy")
          valid = value.IsNumber() && value.Number() >= 0 &&
                  value.Number() <= 3 &&
                  std::floor(value.Number()) == value.Number();
        if (key == "screenSize" || key == "presetMeasuredSpec") {
          valid = value.IsTable() && value.GetLength() == 2;
          for (const char* field : {"width", "height"}) {
            auto number = value.GetProperty(field);
            valid = valid && number.IsNumber() &&
                    number.Number() >=
                        (key == "presetMeasuredSpec" ? INT32_MIN : 0) &&
                    number.Number() <= INT32_MAX &&
                    std::floor(number.Number()) == number.Number();
          }
        }
        if (key == "lynxViewConfig" && value.IsTable()) {
          valid = true;
          for (const auto& field : *value.Table())
            valid &= field.second.IsString();
        }
        break;
      case Kind::kLoadTemplate:
        if (key == "url")
          valid = value.IsString() && !value.StdString().empty();
        if (key == "initialData" || key == "globalProps") valid = IsData(value);
        if (key == "source" && value.IsTable()) {
          auto tag = value.GetProperty("kind");
          if (!tag.IsString()) return false;
          auto type = tag.StdString();
          valid = (type == "url" && value.GetLength() == 1) ||
                  (type == "bytes" && value.GetLength() == 2 &&
                   value.GetProperty("bytes").IsByteArray() &&
                   value.GetProperty("bytes").ByteArray()->GetLength() > 0) ||
                  (value == original.GetProperty("source"));
        }
        break;
      case Kind::kUpdateMetaData:
        valid = (key == "updateData" || key == "globalProps") && IsData(value);
        break;
      case Kind::kCall:
        valid = key == "args" && value.IsArray() &&
                value.GetLength() == original.GetProperty("args").GetLength();
        if (valid) {
          for (const char* field : {"callbackIndices", "opaqueIndices"}) {
            const auto& indices = original.GetProperty(field);
            for (int i = 0; indices.IsArray() && i < indices.GetLength(); ++i) {
              auto index =
                  static_cast<uint32_t>(indices.GetProperty(i).Number());
              valid &= value.GetProperty(index) ==
                       original.GetProperty("args").GetProperty(index);
            }
          }
        }
        break;
      case Kind::kResult:
        valid = key == "value";
        break;
      case Kind::kCallback:
        valid = key == "args" && value.IsArray();
        break;
      default:
        break;
    }
    if (!valid) return false;
  }
  return true;
}

bool ValidMock(const Value& mock, const Value& event) {
  if (!mock.IsTable()) return false;
  for (const auto& field : *mock.Table()) {
    if (field.first.str() != "returnValue" && field.first.str() != "callbacks")
      return false;
  }
  if (!mock.Contains("callbacks")) return true;
  auto callbacks = mock.GetProperty("callbacks");
  if (!callbacks.IsArray()) return false;
  auto indices = event.GetProperty("callbackIndices");
  for (int i = 0; i < callbacks.GetLength(); ++i) {
    auto callback = callbacks.GetProperty(i);
    if (!callback.IsTable() || callback.GetLength() != 2 ||
        !callback.GetProperty("args").IsArray())
      return false;
    bool found = false;
    for (int j = 0; j < indices.GetLength(); ++j)
      found |= callback.GetProperty("argumentIndex") == indices.GetProperty(j);
    if (!found) return false;
  }
  return true;
}
}  // namespace

std::shared_ptr<HostScriptInterceptor> HostScriptInterceptor::Install(
    napi_env env, Thread thread, Reporter reporter) {
  Napi::Env napi(env);
  if (napi.Global().Has("interceptor")) return nullptr;
  auto provider = std::shared_ptr<HostScriptInterceptor>(
      new HostScriptInterceptor(env, thread, std::move(reporter)));
  if (!Interceptor::Attach(provider)) return nullptr;
  auto api = Napi::Object::New(env);
  std::weak_ptr<HostScriptInterceptor> weak = provider;
  for (bool listener : {false, true}) {
    api.Set(listener ? "on" : "use",
            Function(env,
                     [weak,
                      listener](const Napi::CallbackInfo& info) -> Napi::Value {
                       if (auto self = weak.lock(); self && self->active_)
                         return self->Use(info, listener);
                       Napi::Error::New(info.Env(),
                                        "Interceptor environment is detached")
                           .ThrowAsJavaScriptException();
                       return info.Env().Undefined();
                     }));
  }
  provider->api_ = Napi::Persistent(api);
  napi.Global().Set("interceptor", api);
  return provider;
}

void HostScriptInterceptor::Uninstall() {
  if (!active_) return;
  active_ = false;
  Interceptor::Detach(this);
  for (const auto& entry : entries_) HandlerRemoved(entry->kind);
  entries_.clear();
  auto global = Napi::Env(env_).Global();
  if (global.Get("interceptor").StrictEquals(api_.Value()))
    global.Delete("interceptor");
  api_.Reset();
}

Napi::Value HostScriptInterceptor::Use(const Napi::CallbackInfo& info,
                                       bool listener) {
  auto env = info.Env();
  if (info.Length() != 2 || !info[0].IsString() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "Expected an event name and function")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto name = info[0].As<Napi::String>().Utf8Value();
  Kind kind = Kind::kCount;
  for (int i = 0; i < static_cast<int>(Kind::kCount); ++i) {
    if (name == Name(static_cast<Kind>(i))) kind = static_cast<Kind>(i);
  }
  bool ui = kind <= Kind::kUpdateMetaData;
  if (kind == Kind::kCount || listener != (kind == Kind::kCreated) ||
      ui != (thread_ == Thread::kUI)) {
    Napi::TypeError::New(env, "Unsupported interceptor kind or owning thread")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto entry = std::make_shared<Entry>();
  entry->id = next_id_++;
  entry->kind = kind;
  entry->function = Napi::Persistent(info[1].As<Napi::Function>());
  entries_.push_back(entry);
  HandlerAdded(kind);
  auto result = Napi::Object::New(env);
  std::weak_ptr<HostScriptInterceptor> weak = shared_from_this();
  result.Set(
      "dispose",
      Function(env, [weak, id = entry->id](const Napi::CallbackInfo& info) {
        if (auto self = weak.lock(); self && self->active_) self->Remove(id);
        return info.Env().Undefined();
      }));
  return result;
}

void HostScriptInterceptor::Remove(uint64_t id) {
  auto entry = std::find_if(entries_.begin(), entries_.end(),
                            [id](const auto& item) { return item->id == id; });
  if (entry != entries_.end()) {
    HandlerRemoved((*entry)->kind);
    entries_.erase(entry);
  }
}
bool HostScriptInterceptor::HasHandlers(Kind kind) const {
  return active_ &&
         std::any_of(entries_.begin(), entries_.end(),
                     [kind](const auto& entry) { return entry->kind == kind; });
}
void HostScriptInterceptor::ReportError(const std::string& message) {
  LOGE("Host Script interceptor: " << message);
  if (reporter_) reporter_(message);
}

pub::InterceptResult HostScriptInterceptor::Dispatch(Kind kind,
                                                     const Value& event) {
  pub::InterceptResult result;
  if (!active_) return result;
  if (dispatching_) {
    ReportCoverageGap(kind, "Reentrant interceptor dispatch is not supported");
    result.failed = true;
    return result;
  }
  dispatching_ = true;
  Napi::Env env(env_);
  Napi::HandleScope scope(env);
  auto snapshot = entries_;
  Value request =
      kind <= Kind::kUpdateMetaData ? event.GetProperty("request") : event;
  Value merged(lepus::Dictionary::Create());
  bool failed = false;
  for (const auto& entry : snapshot) {
    if (entry->kind != kind) continue;
    auto js_event = ToJS(env, event).As<Napi::Object>();
    if (kind <= Kind::kUpdateMetaData)
      js_event.Set("request", ToJS(env, request));
    else
      js_event = ToJS(env, request).As<Napi::Object>();
    auto chain = Napi::Object::New(env);
    for (const char* action : {"next", "proceed", "mock"}) {
      chain.Set(action, Function(env, [action](const Napi::CallbackInfo& info) {
                  auto decision = Napi::Object::New(info.Env());
                  decision.Set("action", Napi::String::New(info.Env(), action));
                  decision.Set("payload", info.Length()
                                              ? info[0]
                                              : Napi::Object::New(info.Env()));
                  return decision;
                }));
    }
    auto returned = entry->function.Value().Call({js_event, chain});
    if (env.IsExceptionPending() || returned.IsPromise()) {
      failed = true;
      break;
    }
    if (kind == Kind::kCreated) continue;
    Value decision;
    std::vector<napi_value> parents;
    if (!FromJS(returned, &decision, parents) || !decision.IsTable()) {
      failed = true;
      break;
    }
    auto action = decision.GetProperty("action");
    auto patch = decision.GetProperty("payload");
    if (!action.IsString()) {
      failed = true;
      break;
    }
    if (action.StdString() == "mock") {
      if (kind != Kind::kCall || !ValidMock(patch, event)) {
        failed = true;
        break;
      }
      result.mock = std::move(patch);
      break;
    }
    if ((action.StdString() != "next" && action.StdString() != "proceed") ||
        !ValidPatch(kind, patch,
                    kind <= Kind::kUpdateMetaData ? event.GetProperty("request")
                                                  : event)) {
      failed = true;
      break;
    }
    request = Value::ShallowCopy(request);
    for (const auto& item : *patch.Table()) {
      request.SetProperty(item.first, item.second);
      merged.SetProperty(item.first, item.second);
    }
    if (action.StdString() == "proceed") break;
  }
  dispatching_ = false;
  if (failed) {
    std::string message = "Invalid synchronous interceptor decision";
    if (env.IsExceptionPending()) {
      auto exception = env.GetAndClearPendingException();
      auto text = exception.ToString();
      if (env.IsExceptionPending())
        env.GetAndClearPendingException();
      else
        message = text.Utf8Value();
    }
    ReportCoverageGap(kind, message.c_str());
    result = {};
    result.failed = true;
  } else if (merged.GetLength())
    result.patch = std::move(merged);
  return result;
}
}  // namespace lynx::shell
