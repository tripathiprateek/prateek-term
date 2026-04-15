/**
 * default_terminal.node
 *
 * Native macOS addon to set/query the default terminal application.
 * Uses CoreServices LaunchServices (LSSetDefaultRoleHandlerForContentType)
 * for macOS < 12, and NSWorkspace.setDefaultApplication for macOS 12+.
 *
 * Exposed to Node.js via node-addon-api (N-API).
 */

#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <CoreServices/CoreServices.h>

#include <napi.h>

static NSString * const kUnixExecutableUTI = @"public.unix-executable";

// ---------------------------------------------------------------------------
// isDefaultTerminal() → boolean
// Returns true if this app is currently the default shell handler.
// ---------------------------------------------------------------------------
Napi::Value IsDefaultTerminal(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  NSString *bundleId = [[NSBundle mainBundle] bundleIdentifier];
  if (!bundleId) {
    return Napi::Boolean::New(env, false);
  }

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  CFStringRef currentHandler = LSCopyDefaultRoleHandlerForContentType(
    (__bridge CFStringRef)kUnixExecutableUTI,
    kLSRolesShell
  );
#pragma clang diagnostic pop

  bool isDefault = false;
  if (currentHandler) {
    NSString *currentId = (__bridge_transfer NSString *)currentHandler;
    isDefault = [bundleId isEqualToString:currentId];
  }

  return Napi::Boolean::New(env, isDefault);
}

// ---------------------------------------------------------------------------
// setDefaultTerminal() → void  (async — calls back on main thread)
//
// On macOS 12+ uses NSWorkspace.setDefaultApplication(at:toOpen:completion:)
// which shows a system prompt asking the user to confirm.
// On macOS < 12 falls back to the deprecated LSSetDefaultRoleHandlerForContentType.
// ---------------------------------------------------------------------------
Napi::Value SetDefaultTerminal(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  NSString *bundleId = [[NSBundle mainBundle] bundleIdentifier];
  NSURL    *bundleURL = [[NSBundle mainBundle] bundleURL];

  if (!bundleId || !bundleURL) {
    Napi::TypeError::New(env, "Could not determine bundle info").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (@available(macOS 12.0, *)) {
    // Modern API — shows a system confirmation dialog
    [[NSWorkspace sharedWorkspace]
      setDefaultApplicationAtURL:bundleURL
      toOpenContentTypeOfFileAtURL:[NSURL fileURLWithPath:@"/bin/ls"]   // just needs a unix-executable
      completionHandler:^(NSError *error) {
        // Nothing to do — user sees system dialog
        (void)error;
      }
    ];
  } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    OSStatus status = LSSetDefaultRoleHandlerForContentType(
      (__bridge CFStringRef)kUnixExecutableUTI,
      kLSRolesShell,
      (__bridge CFStringRef)bundleId
    );
#pragma clang diagnostic pop
    if (status != noErr) {
      std::string msg = "LSSetDefaultRoleHandlerForContentType failed: " + std::to_string(status);
      Napi::Error::New(env, msg).ThrowAsJavaScriptException();
    }
  }

  return env.Undefined();
}

// ---------------------------------------------------------------------------
// getDefaultTerminalBundleId() → string | null
// Returns the bundle ID of the current default shell handler.
// ---------------------------------------------------------------------------
Napi::Value GetDefaultTerminalBundleId(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  CFStringRef handler = LSCopyDefaultRoleHandlerForContentType(
    (__bridge CFStringRef)kUnixExecutableUTI,
    kLSRolesShell
  );
#pragma clang diagnostic pop

  if (!handler) return env.Null();

  NSString *bundleId = (__bridge_transfer NSString *)handler;
  return Napi::String::New(env, [bundleId UTF8String]);
}

// ---------------------------------------------------------------------------
// Module init
// ---------------------------------------------------------------------------
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isDefaultTerminal",        Napi::Function::New(env, IsDefaultTerminal));
  exports.Set("setDefaultTerminal",        Napi::Function::New(env, SetDefaultTerminal));
  exports.Set("getDefaultTerminalBundleId", Napi::Function::New(env, GetDefaultTerminalBundleId));
  return exports;
}

NODE_API_MODULE(default_terminal, Init)
