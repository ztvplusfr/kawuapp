//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

void SetDockIcon(const void* data, int length) {
    @autoreleasepool {
        NSData* nsData = [NSData dataWithBytes:data length:length];
        NSImage* image = [[NSImage alloc] initWithData:nsData];
        if (image) {
            [NSApp setApplicationIconImage:image];
        }
    }
}
*/
import "C"
import (
	_ "embed"
	"unsafe"
)

//go:embed build/appicon.png
var appIconBytes []byte

func setDockIcon() {
	if len(appIconBytes) > 0 {
		C.SetDockIcon(unsafe.Pointer(&appIconBytes[0]), C.int(len(appIconBytes)))
	}
}
