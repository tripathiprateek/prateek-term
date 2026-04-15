{
  "targets": [
    {
      "target_name": "default_terminal",
      "sources": [ "addon.mm" ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "12.0",
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++17", "-stdlib=libc++"]
          },
          "link_settings": {
            "libraries": [
              "-framework CoreServices",
              "-framework AppKit",
              "-framework Foundation"
            ]
          }
        }]
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    }
  ]
}
