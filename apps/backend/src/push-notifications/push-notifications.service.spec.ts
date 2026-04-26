import { PushNotificationsService } from './push-notifications.service';

describe('PushNotificationsService.detectPlatform', () => {
  it('honors an explicit hint when present in the allowed set', () => {
    expect(PushNotificationsService.detectPlatform('Mozilla/5.0 (iPhone)', 'desktop')).toBe(
      'desktop',
    );
  });

  it('ignores an unknown hint and falls back to UA detection', () => {
    expect(PushNotificationsService.detectPlatform('Mozilla/5.0 (iPhone)', 'banana')).toBe('ios');
  });

  it('detects iOS for iPhone / iPod / iPad UAs', () => {
    expect(
      PushNotificationsService.detectPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari/605.1.15',
      ),
    ).toBe('ios');
    expect(
      PushNotificationsService.detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'),
    ).toBe('ios');
  });

  it('detects macOS for desktop Safari', () => {
    expect(
      PushNotificationsService.detectPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      ),
    ).toBe('macos');
  });

  it('detects Android', () => {
    expect(
      PushNotificationsService.detectPlatform(
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/124.0.0.0',
      ),
    ).toBe('android');
  });

  it('detects desktop for Windows / Linux / ChromeOS', () => {
    expect(
      PushNotificationsService.detectPlatform('Mozilla/5.0 (Windows NT 10.0) Chrome/124.0'),
    ).toBe('desktop');
    expect(
      PushNotificationsService.detectPlatform('Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0'),
    ).toBe('desktop');
  });

  it('returns "unknown" for missing or unrecognized UA', () => {
    expect(PushNotificationsService.detectPlatform()).toBe('unknown');
    expect(PushNotificationsService.detectPlatform('Strange/1.0')).toBe('unknown');
  });
});
