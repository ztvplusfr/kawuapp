//go:build darwin

#import <Foundation/Foundation.h>
#import <MediaPlayer/MediaPlayer.h>
#import <AppKit/AppKit.h>

// UpdateNowPlaying sets the native macOS Now Playing info (used by AirPlay/Center Control)
// title: line 1, subtitle: line 2, artworkURL: optional cover image
void UpdateNowPlaying(const char* title, const char* subtitle, const char* artist, const char* album, double duration, double position, double rate) {
    @autoreleasepool {
        NSString *nsTitle = title ? [NSString stringWithUTF8String:title] : @"";
        NSString *nsSubtitle = subtitle ? [NSString stringWithUTF8String:subtitle] : @"";
        NSString *nsArtist = artist ? [NSString stringWithUTF8String:artist] : @"";
        NSString *nsAlbum = album ? [NSString stringWithUTF8String:album] : @"";

        NSMutableDictionary *info = [NSMutableDictionary dictionary];
        info[MPMediaItemPropertyTitle] = nsTitle;
        info[MPMediaItemPropertyAlbumTitle] = nsSubtitle.length > 0 ? nsSubtitle : nsAlbum;
        info[MPMediaItemPropertyArtist] = nsArtist;
        info[MPMediaItemPropertyAlbumArtist] = nsAlbum;
        info[MPMediaItemPropertyPlaybackDuration] = @(duration);
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(position);
        info[MPNowPlayingInfoPropertyPlaybackRate] = @(rate);

        [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = info;
    }
}

void ClearNowPlaying() {
    @autoreleasepool {
        [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = nil;
    }
}

void SetPlaybackState(int state) {
    @autoreleasepool {
        // 0 = paused, 1 = playing
        // No direct state setter, but we can set rate
        // For state, we use rate in info dict
    }
}
