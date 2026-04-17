(function () {
  const DEFAULT_COLOR_KEY = 'ember';
  const COLOR_OPTIONS = [
    { key: 'ember', label: 'Ember', hex: '#d05834' },
    { key: 'cobalt', label: 'Cobalt', hex: '#4668df' },
    { key: 'teal', label: 'Teal', hex: '#0f8c7c' },
    { key: 'gold', label: 'Gold', hex: '#b77a22' },
    { key: 'plum', label: 'Plum', hex: '#8f55b6' }
  ];
  const COLOR_MAP = Object.fromEntries(COLOR_OPTIONS.map(function (option) {
    return [option.key, option];
  }));

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeHex(hex) {
    const trimmed = String(hex || '').trim().replace('#', '');

    if (trimmed.length === 3) {
      return `#${trimmed.split('').map(function (char) {
        return `${char}${char}`;
      }).join('')}`;
    }

    return `#${trimmed.slice(0, 6)}`;
  }

  function hexToRgb(hex) {
    const normalized = normalizeHex(hex);
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16)
    };
  }

  function rgbToHex(rgb) {
    const channels = [rgb.r, rgb.g, rgb.b].map(function (channel) {
      return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0');
    });

    return `#${channels.join('')}`;
  }

  function rgbToHsl(rgb) {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));

      switch (max) {
        case r:
          h = ((g - b) / delta) % 6;
          break;
        case g:
          h = (b - r) / delta + 2;
          break;
        default:
          h = (r - g) / delta + 4;
          break;
      }

      h *= 60;
      if (h < 0) {
        h += 360;
      }
    }

    return { h: h || 0, s, l };
  }

  function hueToRgb(p, q, t) {
    let value = t;

    if (value < 0) {
      value += 1;
    }

    if (value > 1) {
      value -= 1;
    }

    if (value < 1 / 6) {
      return p + (q - p) * 6 * value;
    }

    if (value < 1 / 2) {
      return q;
    }

    if (value < 2 / 3) {
      return p + (q - p) * (2 / 3 - value) * 6;
    }

    return p;
  }

  function hslToRgb(hsl) {
    const h = ((hsl.h % 360) + 360) % 360 / 360;
    const s = clamp(hsl.s, 0, 1);
    const l = clamp(hsl.l, 0, 1);

    if (s === 0) {
      const gray = Math.round(l * 255);
      return { r: gray, g: gray, b: gray };
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return {
      r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hueToRgb(p, q, h) * 255),
      b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255)
    };
  }

  function adjustHsl(hex, changes) {
    const hsl = rgbToHsl(hexToRgb(hex));
    const adjusted = {
      h: hsl.h + (changes.h || 0),
      s: clamp(hsl.s + (changes.s || 0), 0, 1),
      l: clamp(hsl.l + (changes.l || 0), 0, 1)
    };

    return rgbToHex(hslToRgb(adjusted));
  }

  function relativeLuminance(rgb) {
    function convert(channel) {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }

    return 0.2126 * convert(rgb.r) + 0.7152 * convert(rgb.g) + 0.0722 * convert(rgb.b);
  }

  function resolveColorKey(key) {
    const normalized = String(key || '').trim().toLowerCase();
    return COLOR_MAP[normalized] ? normalized : DEFAULT_COLOR_KEY;
  }

  function derivePalette(colorKey) {
    const resolvedKey = resolveColorKey(colorKey);
    const option = COLOR_MAP[resolvedKey] || COLOR_MAP[DEFAULT_COLOR_KEY];
    const rgb = hexToRgb(option.hex);
    const strong = adjustHsl(option.hex, { l: -0.16, s: 0.04 });
    const soft = adjustHsl(option.hex, { l: 0.18, s: -0.08 });
    const muted = adjustHsl(option.hex, { l: 0.3, s: -0.2 });
    const linkLight = adjustHsl(option.hex, { l: -0.08, s: 0.04 });
    const linkDark = adjustHsl(option.hex, { l: 0.24, s: -0.06 });
    const contrast = relativeLuminance(rgb) > 0.42 ? '#211714' : '#fff8f4';

    return {
      key: option.key,
      label: option.label,
      base: option.hex,
      strong,
      soft,
      muted,
      contrast,
      rgb: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
      highlight: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`,
      highlightStrong: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`,
      border: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`,
      shadow: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`,
      linkLight,
      linkDark
    };
  }

  function applyPalette(colorKey, target) {
    const palette = derivePalette(colorKey);
    const element = target || document.documentElement;

    element.style.setProperty('--app-accent', palette.base);
    element.style.setProperty('--app-accent-strong', palette.strong);
    element.style.setProperty('--app-accent-soft', palette.soft);
    element.style.setProperty('--app-accent-muted', palette.muted);
    element.style.setProperty('--app-accent-contrast', palette.contrast);
    element.style.setProperty('--app-accent-rgb', palette.rgb);
    element.style.setProperty('--app-accent-highlight', palette.highlight);
    element.style.setProperty('--app-accent-highlight-strong', palette.highlightStrong);
    element.style.setProperty('--app-accent-border', palette.border);
    element.style.setProperty('--app-accent-shadow', palette.shadow);
    element.style.setProperty('--app-link-light', palette.linkLight);
    element.style.setProperty('--app-link-dark', palette.linkDark);
    element.setAttribute('data-theme-color', palette.key);

    return palette;
  }

  function getMetaThemeColor(mode, palette) {
    if (!palette) {
      return COLOR_MAP[DEFAULT_COLOR_KEY].hex;
    }

    return mode === 'dark' ? palette.strong : palette.base;
  }

  window.DyslibriaTheme = {
    DEFAULT_COLOR_KEY: DEFAULT_COLOR_KEY,
    COLOR_OPTIONS: COLOR_OPTIONS.slice(),
    resolveColorKey: resolveColorKey,
    derivePalette: derivePalette,
    applyPalette: applyPalette,
    getMetaThemeColor: getMetaThemeColor
  };
})();
