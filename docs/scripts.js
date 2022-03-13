'use string';

/**
 * @param {HTMLElement} wrapper
 */
function FontViewer(wrapper) {
  this.viewer = wrapper.querySelector('.viewer');
}

/**
 * @param {HTMLElement} element
 * @param {string} property
 */
FontViewer.prototype.setInputEvent = function (element, property) {
  var self = this;
  element.addEventListener('input', function (ev) {
    self.viewer.style.setProperty(property, ev.target.value);
  });
};

window.addEventListener('DOMContentLoaded', function () {
  var notoVFWrapper = document.getElementById('noto-vf-wrapper');
  var notoVFSlider = document.getElementById('noto-vf-slider');
  var notoVF = new FontViewer(notoVFWrapper);
  notoVF.setInputEvent(notoVFSlider, '--text-wght');

  var notoVFMonoWrapper = document.getElementById('noto-vf-mono-wrapper');
  var notoVFMonoSlider = document.getElementById('noto-vf-mono-slider');
  var notoVFMono = new FontViewer(notoVFMonoWrapper);
  notoVFMono.setInputEvent(notoVFMonoSlider, '--text-wght');
});
