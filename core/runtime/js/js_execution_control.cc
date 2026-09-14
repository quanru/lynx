// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "core/runtime/js/js_execution_control.h"

#include <memory>
#include <mutex>
#include <unordered_map>
#include <utility>

#include "base/include/fml/message_loop.h"
#include "base/include/no_destructor.h"
#include "core/base/threading/task_runner_manufactor.h"

namespace lynx {
namespace runtime {
namespace js {
namespace {

base::NoDestructor<std::mutex> vm_mutex;
base::NoDestructor<std::unordered_map<fml::MessageLoopImpl*, VMInstance*>>
    vm_instances_by_loop;

fml::MessageLoopImpl* GetCurrentJSLoop() {
  auto* loop = fml::MessageLoop::IsInitializedForCurrentThread();
  return loop == nullptr ? nullptr : loop->GetLoopImpl().get();
}

}  // namespace

void RegisterVMInstance(VMInstance* vm) {
  auto* js_loop = GetCurrentJSLoop();
  if (vm == nullptr || js_loop == nullptr) {
    return;
  }
  std::lock_guard<std::mutex> lock(*vm_mutex);
  (*vm_instances_by_loop)[js_loop] = vm;
}

void UnregisterVMInstance(VMInstance* vm) {
  if (vm == nullptr) {
    return;
  }
  auto* js_loop = GetCurrentJSLoop();
  if (js_loop == nullptr) {
    return;
  }
  std::lock_guard<std::mutex> lock(*vm_mutex);
  auto loop_it = vm_instances_by_loop->find(js_loop);
  if (loop_it != vm_instances_by_loop->end() && loop_it->second == vm) {
    vm_instances_by_loop->erase(loop_it);
  }
}

void CaptureJavaScriptStack(
    const std::string& js_group_thread_name,
    base::MoveOnlyClosure<void, JSStackCaptureResult, std::string> callback) {
  auto completion = std::make_shared<
      base::MoveOnlyClosure<void, JSStackCaptureResult, std::string>>(
      std::move(callback));
  auto js_runner =
      base::TaskRunnerManufactor::GetJSRunner(js_group_thread_name);
  std::lock_guard<std::mutex> lock(*vm_mutex);
  auto it = vm_instances_by_loop->find(js_runner->GetLoop().get());
  if (it == vm_instances_by_loop->end()) {
    // The VM was destroyed before the request reached the JS engine.
    (*completion)(JSStackCaptureResult::kVMDestroyed, {});
    return;
  }
  auto* vm = it->second;
  bool accepted =
      vm->CaptureJavaScriptStack([completion](std::string stack) mutable {
        (*completion)(JSStackCaptureResult::kSuccess, std::move(stack));
      });
  if (!accepted) {
    // The VM is alive but declined to return a stack (e.g. not running JS).
    (*completion)(JSStackCaptureResult::kStackUnavailable, {});
  }
}

bool TerminateJavaScriptExecution(const std::string& js_group_thread_name) {
  auto js_runner =
      base::TaskRunnerManufactor::GetJSRunner(js_group_thread_name);
  std::lock_guard<std::mutex> lock(*vm_mutex);
  auto it = vm_instances_by_loop->find(js_runner->GetLoop().get());
  return it != vm_instances_by_loop->end() &&
         it->second->TerminateJavaScriptExecution();
}

}  // namespace js
}  // namespace runtime
}  // namespace lynx
