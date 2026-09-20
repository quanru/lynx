// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#ifndef CORE_SHELL_HOST_SCRIPT_RUNTIME_HOST_SCRIPT_INTERCEPTOR_H_
#define CORE_SHELL_HOST_SCRIPT_RUNTIME_HOST_SCRIPT_INTERCEPTOR_H_

#include <functional>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "core/public/interceptor.h"
#include "core/runtime/common/napi/napi_environment.h"

namespace lynx::shell {

// The runtime owner installs this into an existing environment, on its owning
// thread. This component never creates a VM, thread or cross-thread JS handle.
class HostScriptInterceptor final
    : public pub::Interceptor,
      public std::enable_shared_from_this<HostScriptInterceptor> {
 public:
  enum class Thread { kUI, kBTS };
  using Reporter = std::function<void(const std::string&)>;
  static std::shared_ptr<HostScriptInterceptor> Install(
      napi_env env, Thread thread, Reporter reporter = nullptr);
  void Uninstall();
  bool HasHandlers(pub::InterceptKind kind) const override;
  pub::InterceptResult Dispatch(pub::InterceptKind kind,
                                const lepus::Value& event) override;
  void ReportError(const std::string& message) override;

 private:
  struct Entry {
    uint64_t id;
    pub::InterceptKind kind;
    Napi::FunctionReference function;
  };
  HostScriptInterceptor(napi_env env, Thread thread, Reporter reporter)
      : env_(env), thread_(thread), reporter_(std::move(reporter)) {}
  Napi::Value Use(const Napi::CallbackInfo& info, bool listener);
  void Remove(uint64_t id);
  napi_env env_;
  Thread thread_;
  Reporter reporter_;
  uint64_t next_id_ = 1;
  bool active_ = true;
  bool dispatching_ = false;
  Napi::ObjectReference api_;
  std::vector<std::shared_ptr<Entry>> entries_;
};
}  // namespace lynx::shell
#endif  // CORE_SHELL_HOST_SCRIPT_RUNTIME_HOST_SCRIPT_INTERCEPTOR_H_
