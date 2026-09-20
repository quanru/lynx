// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#include "core/shell/host_script/runtime/host_script_session.h"

#include <memory>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include "base/include/fml/task_runner.h"
#include "base/include/value/array.h"
#include "base/include/value/table.h"
#include "core/runtime/common/napi/napi_environment.h"
#include "core/runtime/common/napi/napi_runtime_proxy.h"
#include "core/runtime/common/napi/napi_runtime_proxy_quickjs.h"
#include "core/shell/host_script/runtime/host_script_interceptor.h"
#include "core/shell/host_script/runtime/host_script_module.h"
#include "quickjs/include/quickjs.h"
#include "third_party/googletest/googletest/include/gtest/gtest.h"

namespace lynx {
namespace shell {
namespace {

using runtime::js::NapiEnvironment;
using runtime::js::NapiRuntimeProxy;
using runtime::js::NapiRuntimeProxyQuickjs;

struct FakeProxyState {
  bool accepts = true;
  std::vector<std::string> calls;
  std::string global_props;
  LynxViewRefLoadTemplateRequest load_template;
  LynxViewRefSsrRequest load_ssr;
  LynxViewRefSsrRequest hydrate_ssr;
  LynxViewRefUpdateMetaDataRequest update_data;
  LynxViewRefReloadTemplateRequest reload_template;
  LynxViewRefGlobalEventRequest global_event;
  int invalidate_count = 0;
};

class FakeLynxViewRefProxy final : public LynxViewRefProxy {
 public:
  explicit FakeLynxViewRefProxy(std::shared_ptr<FakeProxyState> state)
      : state_(std::move(state)) {}

  bool LoadTemplate(LynxViewRefLoadTemplateRequest request) override {
    state_->load_template = std::move(request);
    return Record("loadTemplate");
  }

  bool LoadSSR(LynxViewRefSsrRequest request) override {
    state_->load_ssr = std::move(request);
    return Record("loadSSR");
  }

  bool HydrateSSR(LynxViewRefSsrRequest request) override {
    state_->hydrate_ssr = std::move(request);
    return Record("hydrateSSR");
  }

  bool UpdateMetaData(LynxViewRefUpdateMetaDataRequest request) override {
    state_->update_data = std::move(request);
    return Record("updateMetaData");
  }

  bool ReloadTemplate(LynxViewRefReloadTemplateRequest request) override {
    state_->reload_template = std::move(request);
    return Record("reloadTemplate");
  }

  bool SendGlobalEvent(LynxViewRefGlobalEventRequest request) override {
    state_->global_event = std::move(request);
    return Record("sendGlobalEvent");
  }

  bool SetGlobalProps(std::string global_props) override {
    state_->global_props = std::move(global_props);
    return Record("setGlobalProps");
  }

  void Invalidate() override { ++state_->invalidate_count; }

 private:
  bool Record(std::string name) {
    state_->calls.push_back(std::move(name));
    return state_->accepts;
  }

  std::shared_ptr<FakeProxyState> state_;
};

class ModuleDelegate final : public NapiEnvironment::Delegate {
 public:
  void RegisterModule(const std::string& name,
                      std::unique_ptr<Module> module) override {
    modules_[name] = std::move(module);
  }

  Module* GetModule(const std::string& name) override {
    auto found = modules_.find(name);
    return found == modules_.end() ? nullptr : found->second.get();
  }

  void OnDetach(Napi::Env env) override {
    for (auto& entry : modules_) {
      entry.second->OnEnvDetach(env);
    }
  }

 private:
  std::unordered_map<std::string, std::unique_ptr<Module>> modules_;
};

class QueuedTaskRunner final : public fml::TaskRunner {
 public:
  QueuedTaskRunner() : fml::TaskRunner(nullptr) {}
  void PostTask(base::closure closure) override {
    tasks_.push_back(std::move(closure));
  }

  bool DrainTasks() {
    if (tasks_.empty()) {
      return false;
    }
    auto tasks = std::move(tasks_);
    tasks_.clear();
    for (auto& task : tasks) {
      task();
    }
    return true;
  }

 private:
  std::vector<base::closure> tasks_;
};

class HostScriptSessionTest : public ::testing::Test {
 public:
  HostScriptSessionTest()
      : runtime_(LEPUS_NewRuntime()),
        context_(LEPUS_NewContext(runtime_)),
        runtime_proxy_(static_cast<NapiRuntimeProxy*>(
            NapiRuntimeProxyQuickjs::Create(
                context_,
                std::make_shared<runtime::js::DelegateObserver>(task_runner_))
                .release())),
        delegate_(new ModuleDelegate()),
        environment_(std::unique_ptr<ModuleDelegate>(delegate_)),
        env_(runtime_proxy_->Env()) {
    environment_.SetRuntimeProxy(std::move(runtime_proxy_));
    environment_.Attach();
  }

  ~HostScriptSessionTest() override {
    if (session_) {
      session_->Detach();
    }
    environment_.Detach();
    session_.reset();
    LEPUS_FreeContext(context_);
    LEPUS_FreeRuntime(runtime_);
  }

 protected:
  void CreateSession(bool attach_first) {
    state_ = std::make_shared<FakeProxyState>();
    session_ = HostScriptSession::Create();
    if (attach_first) {
      EXPECT_TRUE(session_->Attach(env_));
    }
    EXPECT_TRUE(
        session_->BindView(std::make_unique<FakeLynxViewRefProxy>(state_)));
    if (!attach_first) {
      EXPECT_TRUE(session_->Attach(env_));
    }
  }

  void LoadModule() {
    auto* module = delegate_->GetModule("host_script");
    ASSERT_NE(module, nullptr);
    Napi::Object target = Napi::Object::New(env_);
    module->OnLoad(target);
    env_.Global().Set("viewRef", target);
  }

  void PumpJobs() {
    bool did_work = false;
    do {
      did_work = task_runner_->DrainTasks();
      LEPUSContext* pending_context = nullptr;
      while (LEPUS_ExecutePendingJob(runtime_, &pending_context) > 0) {
        did_work = true;
      }
    } while (did_work);
  }

  std::string EvalString(const char* script) {
    return env_.RunScript(script).ToString().Utf8Value();
  }

  LEPUSRuntime* runtime_;
  LEPUSContext* context_;
  fml::RefPtr<QueuedTaskRunner> task_runner_ =
      fml::MakeRefCounted<QueuedTaskRunner>();
  std::unique_ptr<NapiRuntimeProxy> runtime_proxy_;
  ModuleDelegate* delegate_;
  NapiEnvironment environment_;
  Napi::Env env_;
  std::shared_ptr<FakeProxyState> state_;
  std::shared_ptr<HostScriptSession> session_;
};

class HostScriptInterceptorTest : public HostScriptSessionTest {
 protected:
  ~HostScriptInterceptorTest() override {
    if (provider_) provider_->Uninstall();
  }
  void Install(HostScriptInterceptor::Thread thread =
                   HostScriptInterceptor::Thread::kUI) {
    provider_ = HostScriptInterceptor::Install(env_, thread);
    ASSERT_NE(provider_, nullptr);
  }
  void Script(const char* source) {
    env_.RunScript(source);
    ASSERT_FALSE(env_.IsExceptionPending());
  }
  pub::InterceptResult Dispatch(
      pub::InterceptKind kind = pub::InterceptKind::kCreate) {
    lepus::Value event(lepus::Dictionary::Create());
    lepus::Value request(lepus::Dictionary::Create());
    request.SetProperty("fontScale", lepus::Value(1));
    event.SetProperty("viewId", lepus::Value("1"));
    event.SetProperty("request", request);
    return provider_->Dispatch(kind, event);
  }
  std::shared_ptr<HostScriptInterceptor> provider_;
};

TEST_F(HostScriptInterceptorTest, OrderedPatchesAndProceed) {
  Install();
  Script(R"(
    interceptor.use('view.create', (e,c) => c.next({fontScale: 2}));
    interceptor.use('view.create', (e,c) => c.proceed({fontScale: e.request.fontScale + 1}));
    interceptor.use('view.create', () => {throw Error('must not execute')});
  )");
  auto result = Dispatch();
  EXPECT_FALSE(result.failed);
  EXPECT_EQ(result.patch.GetProperty("fontScale").Number(), 3);
}

TEST_F(HostScriptInterceptorTest, RegistrationSnapshotAndDispose) {
  Install();
  Script(R"(
    globalThis.calls = [];
    interceptor.use('view.create', (e,c) => {
      calls.push('first'); second.dispose();
      interceptor.use('view.create', (e,c) => {calls.push('late'); return c.next()});
      return c.next();
    });
    globalThis.second = interceptor.use('view.create', (e,c) => {calls.push('second'); return c.next()});
  )");
  EXPECT_FALSE(Dispatch().failed);
  EXPECT_EQ(EvalString("calls.join(',')"), "first,second");
  Script("calls = []");
  EXPECT_FALSE(Dispatch().failed);
  EXPECT_EQ(EvalString("calls.join(',')"), "first,late");
}

TEST_F(HostScriptInterceptorTest, InvalidDecisionsRollbackWholePhase) {
  const char* invalid[] = {"throw Error('failure')",
                           "return Promise.resolve(c.next())",
                           "return undefined",
                           "return c.next({fontScale:-1})",
                           "return c.mock({})",
                           "const x={}; x.self=x; return c.next(x)",
                           "return c.next({fontScale: NaN})"};
  for (auto body : invalid) {
    Install();
    Script("interceptor.use('view.create', (e,c) => c.next({fontScale:2}))");
    std::string source =
        "interceptor.use('view.create', (e,c) => {" + std::string(body) + "})";
    Script(source.c_str());
    auto before = pub::Interceptor::FailureCount();
    auto result = Dispatch();
    EXPECT_TRUE(result.failed) << body;
    EXPECT_FALSE(result.patch.IsTable());
    EXPECT_FALSE(result.mock.IsTable());
    EXPECT_EQ(pub::Interceptor::FailureCount(), before + 1);
    EXPECT_FALSE(env_.IsExceptionPending());
    provider_->Uninstall();
    provider_.reset();
  }
}

TEST_F(HostScriptInterceptorTest, ThreadRegistrationAndUnload) {
  Install();
  EXPECT_EQ(EvalString("try { interceptor.use('jsb.call', ()=>{}); 'bad' } "
                       "catch(e) { 'ok' }"),
            "ok");
  Script(
      "globalThis.oldApi=interceptor; "
      "interceptor.use('view.create',(e,c)=>c.next())");
  provider_->Uninstall();
  EXPECT_EQ(pub::Interceptor::Current(pub::InterceptKind::kCreate), nullptr);
  EXPECT_EQ(
      EvalString(
          "try { oldApi.use('view.create',()=>{}); 'bad' } catch(e) { 'ok' }"),
      "ok");
  provider_.reset();
  Install();
  EXPECT_FALSE(provider_->HasHandlers(pub::InterceptKind::kCreate));
}

TEST_F(HostScriptInterceptorTest, MockValidatesAllCallbacksBeforeCommit) {
  Install(HostScriptInterceptor::Thread::kBTS);
  lepus::Value event(lepus::Dictionary::Create());
  auto indices = lepus::CArray::Create();
  indices->push_back(lepus::Value(0));
  event.SetProperty("callbackIndices", lepus::Value(indices));
  Script(
      "globalThis.d = "
      "interceptor.use('jsb.call',(e,c)=>c.mock({returnValue:7,callbacks:[{"
      "argumentIndex:0,args:[1]},{argumentIndex:0,args:[2]}]}))");
  auto result = provider_->Dispatch(pub::InterceptKind::kCall, event);
  EXPECT_FALSE(result.failed);
  EXPECT_EQ(result.mock.GetProperty("returnValue").Number(), 7);
  EXPECT_EQ(result.mock.GetProperty("callbacks").GetLength(), 2);
  Script(
      "d.dispose(); "
      "interceptor.use('jsb.call',(e,c)=>c.mock({callbacks:[{argumentIndex:0,"
      "args:[]},{argumentIndex:1,args:[]}]}))");
  result = provider_->Dispatch(pub::InterceptKind::kCall, event);
  EXPECT_TRUE(result.failed);
  EXPECT_FALSE(result.mock.IsTable());
}

TEST_F(HostScriptInterceptorTest, ViewIdentityIsIndependentOfURL) {
  auto first = pub::Interceptor::CreateView();
  auto second = pub::Interceptor::CreateView();
  EXPECT_NE(first, second);
  pub::Interceptor::BindView(first, 101);
  pub::Interceptor::BindView(second, 102);
  EXPECT_EQ(pub::Interceptor::FindView(101), first);
  pub::Interceptor::DestroyView(first);
  EXPECT_EQ(pub::Interceptor::FindView(101), 0u);
  EXPECT_EQ(pub::Interceptor::FindView(102), second);
  pub::Interceptor::DestroyView(second);
}

TEST_F(HostScriptSessionTest, SupportsBothAttachAndBindOrders) {
  for (bool attach_first : {true, false}) {
    state_ = std::make_shared<FakeProxyState>();
    session_ = HostScriptSession::Create();
    if (attach_first) {
      ASSERT_TRUE(session_->Attach(env_));
    } else {
      ASSERT_TRUE(
          session_->BindView(std::make_unique<FakeLynxViewRefProxy>(state_)));
    }
    if (!attach_first) {
      ASSERT_TRUE(session_->Attach(env_));
    }
    env_.RunScript(R"(
      globalThis.readyCount = 0;
      globalThis.waiterResolved = false;
      globalThis.readyListener = () => ++readyCount;
    )");
    session_->AddListener(
        "ready", env_.Global().Get("readyListener").As<Napi::Function>());
    env_.Global().Set("waiter", session_->WaitForCurrentView(env_));
    env_.RunScript("waiter.then(() => waiterResolved = true)");
    if (attach_first) {
      ASSERT_TRUE(
          session_->BindView(std::make_unique<FakeLynxViewRefProxy>(state_)));
    }
    PumpJobs();

    EXPECT_TRUE(session_->HasCurrentView());
    EXPECT_EQ(EvalString("String(readyCount)"), "1");
    EXPECT_EQ(EvalString("String(waiterResolved)"), "true");
    session_->Detach();
    EXPECT_FALSE(session_->HasCurrentView());
    session_.reset();
  }
}

TEST_F(HostScriptSessionTest, CopiesAndAcceptsOperationsWithoutPromises) {
  CreateSession(true);
  LoadModule();
  EXPECT_EQ(EvalString(R"(
    [viewRef.loadTemplate(new Uint8Array([1,2,3]).buffer, 'lynx://page',
                         '{"initial":1}', '{"global":2}', 'processor', true),
     viewRef.loadSSR(new Uint8Array([4,5]).buffer, 'lynx://ssr', '{}'),
     viewRef.hydrateSSR(new Uint8Array([6]).buffer, 'lynx://hydrate', '{}'),
     viewRef.updateMetaData('{"update":1}', '{"props":2}'),
     viewRef.reloadTemplate('{"reload":1}', '{"props":1}'),
     viewRef.sendGlobalEvent('event', '[1,2]'),
     viewRef.setGlobalProps('{"theme":"dark"}')].every(v => v === true)
  )"),
            "true");
  EXPECT_EQ(state_->calls.size(), 7u);
  EXPECT_EQ(state_->load_template.template_data,
            (std::vector<uint8_t>{1, 2, 3}));
  EXPECT_EQ(state_->load_template.url, "lynx://page");
  EXPECT_EQ(state_->load_template.initial_data_json, "{\"initial\":1}");
  EXPECT_EQ(state_->load_template.global_props_json, "{\"global\":2}");
  EXPECT_EQ(state_->load_template.processor_name, "processor");
  EXPECT_TRUE(state_->load_template.read_only);
  EXPECT_EQ(state_->load_ssr.data, (std::vector<uint8_t>{4, 5}));
  EXPECT_EQ(state_->hydrate_ssr.data, (std::vector<uint8_t>{6}));
  EXPECT_TRUE(state_->update_data.has_data);
  EXPECT_TRUE(state_->update_data.has_global_props);
  EXPECT_EQ(state_->update_data.data_json, "{\"update\":1}");
  EXPECT_EQ(state_->update_data.global_props_json, "{\"props\":2}");
  EXPECT_EQ(state_->global_event.params_json, "[1,2]");
  EXPECT_EQ(state_->global_props, "{\"theme\":\"dark\"}");
}

TEST_F(HostScriptSessionTest, PreservesAbsentMetadataAndDoesNotCacheUpdates) {
  CreateSession(true);
  LoadModule();
  EXPECT_EQ(EvalString("viewRef.updateMetaData(undefined, '{}')"), "true");
  EXPECT_FALSE(state_->update_data.has_data);
  EXPECT_TRUE(state_->update_data.has_global_props);
  EXPECT_EQ(EvalString("viewRef.updateMetaData('{}')"), "true");
  EXPECT_TRUE(state_->update_data.has_data);
  EXPECT_FALSE(state_->update_data.has_global_props);
  EXPECT_EQ(state_->calls.size(), 2u);
  EXPECT_EQ(EvalString("viewRef.loadURL('lynx://url', '{}', '{}')"), "true");
  EXPECT_FALSE(state_->load_template.has_template);
  EXPECT_EQ(state_->load_template.url, "lynx://url");
  state_->accepts = false;
  EXPECT_EQ(EvalString("viewRef.updateMetaData('{}')"), "false");
  EXPECT_EQ(EvalString("viewRef.sendGlobalEvent('event', '[]')"), "false");
}

TEST_F(HostScriptSessionTest, ReportsAsyncErrorsAndDestroysTargetOnce) {
  CreateSession(true);
  LoadModule();
  env_.RunScript(R"(
    globalThis.events = [];
    viewRef.on('error', (code, message) => events.push('error:' + code + ':' + message));
    viewRef.on('destroyed', () => events.push('destroyed'));
  )");
  EXPECT_EQ(EvalString("viewRef.updateMetaData('{}')"), "true");
  session_->Notify("error", -1, "platform failed");
  session_->Notify("destroyed");
  session_->Notify("destroyed");
  session_->Notify("error", -1, "late");
  PumpJobs();
  EXPECT_EQ(EvalString("events.join(',')"),
            "error:-1:platform failed,destroyed");
  EXPECT_EQ(state_->invalidate_count, 1);
  EXPECT_EQ(EvalString("viewRef.updateMetaData('{}')"), "false");
}

TEST_F(HostScriptSessionTest, OrdersLifecycleEventsAndIgnoresLateEvents) {
  CreateSession(true);
  LoadModule();
  env_.RunScript(R"(
    globalThis.events = [];
    ['loadSuccess', 'firstScreen', 'pageUpdate', 'dataUpdated', 'destroyed']
      .forEach(name => viewRef.on(name, () => events.push(name)));
  )");

  session_->Notify("loadSuccess");
  session_->Notify("firstScreen");
  session_->Notify("pageUpdate");
  session_->Notify("dataUpdated");
  session_->Notify("destroyed");
  session_->Notify("destroyed");
  session_->Notify("loadSuccess");
  PumpJobs();

  EXPECT_EQ(EvalString("events.join(',')"),
            "loadSuccess,firstScreen,pageUpdate,dataUpdated,destroyed");
  EXPECT_EQ(state_->invalidate_count, 1);
}

TEST_F(HostScriptSessionTest, DetachRejectsWaiterAndDropsQueuedEvents) {
  state_ = std::make_shared<FakeProxyState>();
  session_ = HostScriptSession::Create();
  ASSERT_TRUE(session_->Attach(env_));
  LoadModule();
  EXPECT_EQ(EvalString("viewRef.updateMetaData('{}')"), "false");
  env_.RunScript(R"(
    globalThis.results = [];
    viewRef.waitForCurrent().catch(error => results.push(error.code));
  )");
  ASSERT_TRUE(
      session_->BindView(std::make_unique<FakeLynxViewRefProxy>(state_)));
  env_.RunScript("viewRef.on('error', () => results.push('late'))");
  session_->Notify("error", -1, "queued");
  session_->Detach();
  session_->Notify("error", -1, "late");
  PumpJobs();
  EXPECT_EQ(EvalString("results.join(',')"), "INVALID_STATE");
  EXPECT_EQ(EvalString("viewRef.loadURL('lynx://page')"), "false");
  EXPECT_EQ(state_->invalidate_count, 1);
}

TEST_F(HostScriptSessionTest, RejectsUnknownEvents) {
  CreateSession(true);
  LoadModule();

  EXPECT_EQ(EvalString(R"(
    (() => {
      try {
        viewRef.on('unknown', () => {});
        return 'accepted';
      } catch (error) {
        return error.code;
      }
    })()
  )"),
            "INVALID_ARGUMENT");
}

TEST_F(HostScriptSessionTest,
       OwnsProtocolWithoutViewAndStopsReportingAfterDetach) {
  std::vector<std::string> results;
  session_ = HostScriptSession::Create(
      [&](const std::string& status, const std::string& message) {
        results.push_back(status + ":" + message);
      });
  EXPECT_FALSE(session_->Attach(nullptr));
  ASSERT_TRUE(session_->Attach(env_));
  EXPECT_FALSE(session_->Attach(env_));
  LoadModule();
  EXPECT_EQ(EvalString("typeof viewRef.getProtocolVersion"), "undefined");
  EXPECT_EQ(EvalString("typeof viewRef.updateData"), "undefined");
  EXPECT_EQ(EvalString("String(viewRef.hasCurrent())"), "false");
  env_.RunScript(
      "viewRef.reportEntryResult('REGISTERED'); "
      "viewRef.reportEntryResult('READY');");
  EXPECT_EQ(results, (std::vector<std::string>{"REGISTERED:", "READY:"}));
  session_->Detach();
  session_->Detach();
  session_->ReportEntryResult("ERROR", "late");
  EXPECT_EQ(results.size(), 2u);
  EXPECT_FALSE(session_->Attach(env_));
}

TEST_F(HostScriptSessionTest, BindsOnceAndInvalidatesOnce) {
  CreateSession(false);
  EXPECT_FALSE(session_->BindView(nullptr));
  EXPECT_FALSE(
      session_->BindView(std::make_unique<FakeLynxViewRefProxy>(state_)));
  session_->InvalidateView();
  session_->InvalidateView();
  EXPECT_EQ(state_->invalidate_count, 1);
  EXPECT_FALSE(session_->HasCurrentView());
  EXPECT_FALSE(
      session_->BindView(std::make_unique<FakeLynxViewRefProxy>(state_)));
  EXPECT_FALSE(
      session_->Dispatch(&LynxViewRefProxy::SetGlobalProps, std::string("{}")));
  EXPECT_TRUE(state_->calls.empty());
}

TEST_F(HostScriptSessionTest, DestructorInvalidatesViewBeforeAttach) {
  auto state = std::make_shared<FakeProxyState>();
  {
    auto session = HostScriptSession::Create();
    EXPECT_TRUE(
        session->BindView(std::make_unique<FakeLynxViewRefProxy>(state)));
  }
  EXPECT_EQ(state->invalidate_count, 1);
}

TEST_F(HostScriptSessionTest,
       EnvironmentDetachOwnsCleanupAfterPlatformReleasesSession) {
  CreateSession(true);
  LoadModule();
  PumpJobs();
  env_.RunScript("globalThis.events = 0; viewRef.on('error', () => ++events)");
  session_->Notify("error", -1, "queued");
  auto weak = std::weak_ptr<HostScriptSession>(session_);
  session_.reset();
  EXPECT_FALSE(weak.expired());
  delegate_->OnDetach(env_);
  PumpJobs();
  EXPECT_EQ(EvalString("String(events)"), "0");
  EXPECT_EQ(EvalString("viewRef.updateMetaData('{}')"), "false");
  EXPECT_EQ(state_->invalidate_count, 1);
}

TEST_F(HostScriptSessionTest, RemovesLastMatchingListenerOnly) {
  CreateSession(true);
  LoadModule();
  env_.RunScript(R"(
    globalThis.events = [];
    const repeat = () => events.push('repeat');
    viewRef.on('pageUpdate', repeat);
    viewRef.on('pageUpdate', () => events.push('middle'));
    viewRef.on('pageUpdate', repeat);
    viewRef.off('pageUpdate', repeat);
  )");
  session_->Notify("pageUpdate");
  PumpJobs();
  EXPECT_EQ(EvalString("events.join(',')"), "repeat,middle");
  // The platform can invalidate between the public availability check and off.
  session_->Notify("destroyed");
  EXPECT_EQ(EvalString("String(viewRef.off('pageUpdate', repeat))"),
            "undefined");
  PumpJobs();
  EXPECT_EQ(EvalString("events.join(',')"), "repeat,middle");
}

TEST_F(HostScriptSessionTest, RejectsWaiterWhenViewIsDestroyedBeforeBinding) {
  session_ = HostScriptSession::Create();
  ASSERT_TRUE(session_->Attach(env_));
  LoadModule();
  env_.RunScript(
      "globalThis.result = ''; viewRef.waitForCurrent().catch(e => result = "
      "e.code);");
  session_->Notify("destroyed");
  PumpJobs();
  EXPECT_EQ(EvalString("result"), "INVALID_STATE");
  EXPECT_FALSE(session_->BindView(std::make_unique<FakeLynxViewRefProxy>(
      std::make_shared<FakeProxyState>())));
}

TEST_F(HostScriptSessionTest, SnapshotsListenersDuringSubscriptionChanges) {
  CreateSession(true);
  LoadModule();
  PumpJobs();
  env_.RunScript(R"(
    globalThis.events = [];
    const second = () => events.push('second');
    const third = () => events.push('third');
    viewRef.on('pageUpdate', () => {
      events.push('first');
      viewRef.off('pageUpdate', second);
      viewRef.on('pageUpdate', third);
    });
    viewRef.on('pageUpdate', second);
  )");
  session_->Notify("pageUpdate");
  PumpJobs();
  EXPECT_EQ(EvalString("events.join(',')"), "first,second");
  session_->Notify("pageUpdate");
  PumpJobs();
  EXPECT_EQ(EvalString("events.join(',')"), "first,second,first,third");
}

TEST_F(HostScriptSessionTest, RejectsInvalidArgumentsBeforePlatformDispatch) {
  CreateSession(true);
  LoadModule();
  EXPECT_EQ(EvalString(R"(
    (() => {
      const calls = [
        () => viewRef.loadTemplate(new ArrayBuffer(0), 'url'),
        () => viewRef.loadTemplate(undefined, ''),
        () => viewRef.loadSSR(new ArrayBuffer(0), 'url'),
        () => viewRef.hydrateSSR(new ArrayBuffer(1), ''),
        () => viewRef.updateMetaData(''),
        () => viewRef.reloadTemplate(1),
        () => viewRef.sendGlobalEvent('', '[]'),
        () => viewRef.on('firstScreen', 1),
        () => viewRef.reportEntryResult(1)
      ];
      return calls.map(call => { try { call(); return 'accepted'; } catch (e) { return e.code; } }).join(',');
    })()
  )"),
            "INVALID_ARGUMENT,INVALID_ARGUMENT,INVALID_ARGUMENT,INVALID_"
            "ARGUMENT,INVALID_ARGUMENT,INVALID_ARGUMENT,INVALID_ARGUMENT,"
            "INVALID_ARGUMENT,INVALID_ARGUMENT");
  EXPECT_TRUE(state_->calls.empty());
}

}  // namespace
}  // namespace shell
}  // namespace lynx
