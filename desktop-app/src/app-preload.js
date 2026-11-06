'use strict';
// Runs inside TF News Studio / TF Post Maker. Makes images from other websites usable on the canvas
// (the app asks for them with CORS, and the desktop app allows that), which keeps video/card export working.
const { webFrame } = require('electron');
webFrame.executeJavaScript('(' + function () {
  try {
    var d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    var need = function (v, img) {
      try { var u = new URL(v, location.href); return (u.protocol === 'http:' || u.protocol === 'https:') && !img.crossOrigin; } catch (e) { return false; }
    };
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) { if (need(v, this)) this.crossOrigin = 'anonymous'; d.set.call(this, v); }
    });
    var sa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      if (this instanceof HTMLImageElement && String(n).toLowerCase() === 'src' && need(v, this)) this.crossOrigin = 'anonymous';
      return sa.call(this, n, v);
    };
  } catch (e) {}
}.toString() + ')()');
