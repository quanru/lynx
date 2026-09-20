// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#ifndef CORE_PUBLIC_INTERCEPTOR_H_
#define CORE_PUBLIC_INTERCEPTOR_H_

#include <cstdint>
#include <memory>
#include <string>

#include "base/include/value/base_value.h"

namespace lynx::pub {

enum class InterceptKind {
  kCreate,
  kCreated,
  kLoadTemplate,
  kUpdateMetaData,
  kCall,
  kResult,
  kCallback,
  kCount
};

struct InterceptResult {
  // Only explicitly changed fields are returned. The caller commits them once.
  lepus::Value patch;
  lepus::Value mock;
  bool failed = false;
};

// Optional synchronous, thread-affine extension. No JS engine dependency.
class Interceptor {
 public:
  virtual ~Interceptor() = default;
  virtual bool HasHandlers(InterceptKind kind) const = 0;
  virtual InterceptResult Dispatch(InterceptKind kind,
                                   const lepus::Value& event) = 0;
  virtual void ReportError(const std::string& message) = 0;

  // Attach/detach on the execution environment's owning thread. A second live
  // environment on the same thread must explicitly detach its predecessor.
  static bool Attach(const std::shared_ptr<Interceptor>& provider);
  static void Detach(const Interceptor* provider);
  static std::shared_ptr<Interceptor> Current(InterceptKind kind);
  static void HandlerAdded(InterceptKind kind);
  static void HandlerRemoved(InterceptKind kind);
  static bool IsEnabled();
  static void ReportCoverageGap(InterceptKind kind, const char* reason);
  static uint64_t FailureCount();

  // Process-unique non-owning identity; URL and group-local IDs are not keys.
  static uint64_t CreateView();
  static void BindView(uint64_t view, int64_t instance);
  static void DestroyView(uint64_t view);
  static uint64_t FindView(int64_t instance);
  static const char* Name(InterceptKind kind);
};

}  // namespace lynx::pub
#endif  // CORE_PUBLIC_INTERCEPTOR_H_
