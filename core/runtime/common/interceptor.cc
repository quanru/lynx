// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "core/public/interceptor.h"

#include <array>
#include <atomic>
#include <mutex>
#include <unordered_map>

#include "base/include/log/logging.h"
#include "base/include/no_destructor.h"

namespace lynx::pub {
namespace {
thread_local std::weak_ptr<Interceptor> current;
constexpr size_t kKinds = static_cast<size_t>(InterceptKind::kCount);
struct State {
  std::array<std::atomic<size_t>, kKinds> handlers{};
  std::atomic<size_t> providers{0};
  std::atomic<uint64_t> failures{0};
  std::atomic<uint64_t> next_view{1};
  std::mutex mutex;
  std::unordered_map<int64_t, uint64_t> views;
};
State& GetState() {
  static base::NoDestructor<State> state;
  return *state;
}
}  // namespace

const char* Interceptor::Name(InterceptKind kind) {
  static constexpr const char* names[] = {
      "view.create", "view.created", "view.loadTemplate", "view.updateMetaData",
      "jsb.call",    "jsb.result",   "jsb.callback"};
  return names[static_cast<size_t>(kind)];
}

bool Interceptor::Attach(const std::shared_ptr<Interceptor>& provider) {
  if (!current.expired()) return false;
  current = provider;
  ++GetState().providers;
  return true;
}

void Interceptor::Detach(const Interceptor* provider) {
  if (auto existing = current.lock(); existing.get() == provider) {
    current.reset();
    --GetState().providers;
  }
}

std::shared_ptr<Interceptor> Interceptor::Current(InterceptKind kind) {
  if (auto provider = current.lock()) {
    return provider->HasHandlers(kind) ? provider : nullptr;
  }
  if (GetState().handlers[static_cast<size_t>(kind)].load()) {
    ReportCoverageGap(kind, "No interceptor environment on the calling thread");
  }
  return nullptr;
}

void Interceptor::HandlerAdded(InterceptKind kind) {
  ++GetState().handlers[static_cast<size_t>(kind)];
}
void Interceptor::HandlerRemoved(InterceptKind kind) {
  --GetState().handlers[static_cast<size_t>(kind)];
}
bool Interceptor::IsEnabled() { return GetState().providers.load() != 0; }
uint64_t Interceptor::FailureCount() { return GetState().failures.load(); }
void Interceptor::ReportCoverageGap(InterceptKind kind, const char* reason) {
  ++GetState().failures;
  LOGE("Interceptor " << Name(kind) << ": " << reason);
  if (auto provider = current.lock()) provider->ReportError(reason);
}

uint64_t Interceptor::CreateView() { return GetState().next_view.fetch_add(1); }
void Interceptor::BindView(uint64_t view, int64_t instance) {
  auto& state = GetState();
  std::lock_guard<std::mutex> lock(state.mutex);
  state.views[instance] = view;
}
void Interceptor::DestroyView(uint64_t view) {
  auto& state = GetState();
  std::lock_guard<std::mutex> lock(state.mutex);
  for (auto it = state.views.begin(); it != state.views.end();) {
    if (it->second == view)
      it = state.views.erase(it);
    else
      ++it;
  }
}
uint64_t Interceptor::FindView(int64_t instance) {
  auto& state = GetState();
  std::lock_guard<std::mutex> lock(state.mutex);
  auto found = state.views.find(instance);
  return found == state.views.end() ? 0 : found->second;
}
}  // namespace lynx::pub
