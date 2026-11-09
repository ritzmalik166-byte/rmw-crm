import UAParser from 'ua-parser-js';

export function describeDevice(userAgent = '') {
  const p = new UAParser(userAgent).getResult();
  const browser = [p.browser.name, p.browser.major].filter(Boolean).join(' ') || 'Unknown browser';
  const os = [p.os.name, p.os.version].filter(Boolean).join(' ') || 'Unknown OS';
  const type = p.device.type === 'mobile' ? 'Mobile' : p.device.type === 'tablet' ? 'Tablet' : `${p.os.name || 'Desktop'} PC`;
  const name = p.device.model ? `${p.device.vendor || ''} ${p.device.model}`.trim() : type;
  return { browser, os, deviceName: name };
}
