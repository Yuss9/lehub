// Show a recognizable browser/device, rather than a raw HTTP User-Agent.
export function deviceLabel(agent: string | null) {
  if (!agent) return "Navigateur";
  const browser = /Edg\//.test(agent) ? "Edge" : /OPR\//.test(agent) ? "Opera" : /(?:Chrome|Chromium|CriOS)\//.test(agent) ? "Chrome" : /(?:Firefox|FxiOS)\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Navigateur";
  const device = /iPhone/.test(agent) ? "iPhone" : /iPad|Macintosh.*Mobile/.test(agent) ? "iPad" : /Android/.test(agent) ? "Android" : /Windows/.test(agent) ? "Windows" : /Macintosh|Mac OS X/.test(agent) ? "Mac" : /Linux/.test(agent) ? "Linux" : "Appareil";
  return `${browser} · ${device}`;
}
