import UAParser from 'ua-parser-js';

/**
 * Browsers freeze the OS in the User-Agent string (Windows 11 still says "Windows NT 10.0", macOS says 10.15.7,
 * Android says 10). The real version comes from the UA-CH platformVersion, which the frontend reads via
 * navigator.userAgentData and sends as X-Client-Platform-Version (or the browser sends Sec-CH-UA-Platform-Version).
 */
export function platformVersionFrom(req) {
  const raw = req?.get?.('x-client-platform-version') || req?.get?.('sec-ch-ua-platform-version') || '';
  const v = String(raw).replace(/"/g, '').trim();
  return /^\d+(\.\d+){0,3}$/.test(v) ? v : null;
}

function resolveOs(name, uaVersion, platformVersion) {
  if (!name) return 'Unknown OS';
  if (platformVersion) {
    const major = Number(platformVersion.split('.')[0]);
    // Windows: platformVersion 13+ is Windows 11, 1-12 is Windows 10, 0 is Windows 7/8/8.1 (keep the UA value).
    if (name === 'Windows') {
      if (major >= 13) return 'Windows 11';
      if (major >= 1) return 'Windows 10';
    } else if (major > 0 && ['Mac OS', 'macOS', 'Android', 'Chrome OS', 'Chromium OS'].includes(name)) {
      return `${name === 'Mac OS' ? 'macOS' : name} ${platformVersion.split('.').slice(0, 2).join('.')}`;
    }
  }
  return [name, uaVersion].filter(Boolean).join(' ');
}

export function describeDevice(userAgent = '', platformVersion = null) {
  const p = new UAParser(userAgent).getResult();
  const browser = [p.browser.name, p.browser.major].filter(Boolean).join(' ') || 'Unknown browser';
  const os = resolveOs(p.os.name, p.os.version, platformVersion);
  const type = p.device.type === 'mobile' ? 'Mobile' : p.device.type === 'tablet' ? 'Tablet' : `${p.os.name || 'Desktop'} PC`;
  const name = p.device.model ? `${p.device.vendor || ''} ${p.device.model}`.trim() : type;
  return { browser, os, deviceName: name };
}

export const describeRequestDevice = (req) => describeDevice(req.get('user-agent'), platformVersionFrom(req));
