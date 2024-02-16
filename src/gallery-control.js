if (typeof window?.galleryControlInterface?.unset === 'function') {
  window.galleryControlInterface?.unset();
}
window.galleryControlInterface = ((options = {}) => {
  const {
    imageSelector,
    thumbPattern,
    fullPattern,
    fullReplacetoThumb,
    waitForError,
    cursorTimeout,
    allowAutoAdvance,
    allowAutoStart,
    isDebugging,
  } = {
    imageSelector: 'img',
    thumbPattern: /^(.*\/)(thumb_)([^\/]+.jpg)/,
    fullPattern: /^(.*\/)([^\/]+.jpg)/,
    fullReplacetoThumb: '$1thumb_$2',
    waitForError: 1000,
    cursorTimeout: 1000,
    allowAutoAdvance: true,
    allowAutoStart: false,
    isDebugging: false,
    ...options,
  };
  const getImage = () => document.querySelector(imageSelector);
  const advanceUrl = (url, delta) => {
    return url.replace(/([0-9]+)(\.jpg)/, (whole, number, extension) => {
      let output = String(Math.max(0, Number(number) + delta));
      while (output.length < number.length) { output = "0"+output; }; return output+extension;
    });
  };
  const largerUrl = (url) => {
    if (thumbPattern.test(url)) {
      return url.replace(thumbPattern, '$1$3');
    } else {
      return url;
    }
  }
  const smallerUrl = (url) => {
    if (fullPattern.test(url) && !thumbPattern.test(url)) {
      return url.replace(fullPattern, fullReplacetoThumb);
    }
    return url;
  };
  const changeImage = (delta, options = {}) => {
    if (errorCooldownTimeout) {
      console.info('The image failed to load recently. Waiting to let the user and/or server cool down.');
      return;
    }
    const {
      whichImage,
      withIntent,
    } = {
      withIntent: false,
      ...options,
    };
    const img = whichImage || getImage();
    const currentUrl = img.src;
    let newUrl = currentUrl;
    if (withIntent) {
      autoAdvance.pause();
      if (allowAutoAdvance && delta.position !== 0) {
        autoAdvance.bump(delta.position);
      }
    }
    Object.keys(delta).forEach((dimension) => {
      const value = delta[dimension];
      const sign = Math.sign(value);
      if (sign === 0) return;
      switch(dimension) {
        case 'position':
          newUrl = advanceUrl(newUrl, value);
          break;
        case 'size':
          newUrl = sign === 1 ? largerUrl(newUrl) : smallerUrl(newUrl);
          break;
      }
    });
    if (newUrl !== currentUrl) {
      img.src = newUrl;
      window.history.replaceState({}, '', newUrl);
    }
    return img;
  };
  let errorCooldownTimeout = null;
  const handleImageError = () => {
    autoAdvance.stop();
    errorCooldownTimeout = setTimeout(() => {errorCooldownTimeout = null}, waitForError);
  };
  const getPointerPosition = (event) => {
    return {
      x: event.pageX ?? event.clientX,
      y: event.pageY ?? event.clientY,
      xMin: window.scrollX,
      yMin: window.scrollY,
      xSpan: document.body.offsetWidth || window.innerWidth,
      ySpan: document.body.offsetHeight || window.innerHeight,
      originalEvent: event,
    };
  };
  const getDeltaFromPointerPosition = (inputPointerInfo = {}) => {
    const {
      x,
      y,
      xSpan,
      ySpan,
      xMin,
      yMin,
    } = pointerInfo = {
      xMin: 0,
      yMin: 0,
      ...inputPointerInfo
    };
    // Normalize from -1 to 1
    const xNormalized = ((x-xMin) / xSpan) * 2 - 1;
    const yNormalized = ((y-yMin) / ySpan) * 2 - 1;
    const delta = {
      position: 0,
      size: 0,
    };
    if (Math.abs(xNormalized) > 0.5) {
      delta.position = Math.sign(xNormalized);
    } else if (Math.abs(yNormalized) > 0.5) {
      delta.size = Math.sign(-1 * yNormalized);
      // Invert vertical, so that bottom is negative.
    }
    if (isDebugging) console.log('computed delta from pointerInfo', delta, pointerInfo);
    return delta;
  };
  const isDeltaNonZero = (delta) => {
    // Same as (but generic): // return Boolean(delta.position || delta.size);
    return Object.keys(delta).reduce((acc, dimension) => acc || (delta[dimension] !== 0), false);
  };
  const handleMouseDown = (e) => {
    // Let secondary/right click through.
    if (e.defaultPrevented || e.button === 2 || e.altKey || e.ctrlKey) return;
    e.preventDefault();
    const _defaultPointerAction = (ignore) => {
      if (allowAutoAdvance) {
        autoAdvance.togglePause();
      } else {
        autoAdvance.stop();
      }
    }
    if (e.button === 1) {
      return _defaultPointerAction();
    }
    const delta = getDeltaFromPointerPosition(getPointerPosition(e));
    if (isDeltaNonZero(delta)) {
      changeImage(delta, {withIntent: true});
    } else {
      _defaultPointerAction(e);
    }
  };
  const CLASS_HIDE_CURSOR = 'hide-cursor';
  let isHidingMouse = false;
  let hideMouseTimeout = null;
  const handleMouseMove = (e) => {
    if (e.defaultPrevented) return;
    if (isHidingMouse) {
      document.body.classList.remove(CLASS_HIDE_CURSOR);
      isHidingMouse = false;
    }
    clearTimeout(hideMouseTimeout);
    hideMouseTimeout = setTimeout(() => {
      document.body.classList.add(CLASS_HIDE_CURSOR);
      isHidingMouse = true;
    }, cursorTimeout);
  };
  const createAutoAdvance = (options = {}) => {
    const autoAdvanceOptions = {
      // rates are in Hz
      startRate: 1,
      minRate: 0.25,
      maxRate: 10,
      minSpan: 2, // how many steps before auto takes on a rate
      maxSpan: 4,
      maxIntervalScale: 3,
      ...options,
    };
    const {
      startRate,
      minRate,
      maxRate,
      maxSpan,
    } = autoAdvanceOptions;
    const state = {
      rate: 0,
      isPaused: true,
      direction: 0,
      autoAdvanceTimeout: null,
      times: [],
    };
    const getAvgRateFromTimes = (times, options = {}) => {
      const {
        minSpan,
        maxSpan,
        maxIntervalScale,
      } = options;
      if (times.length < minSpan) return 0;
      const span = maxSpan >= minSpan
        ? Math.min(maxSpan, times.length)
        : times.length;
      if (times[0] - times[1] > maxIntervalScale * (times[1] - times[2])) {
        times.splice(1);
        return 0;
      }
      const avgIntervalMs = (times[0] - times[span - 1]) / span;
      return 1000/avgIntervalMs;
    };
    const clearAdvanceInterval = () => {
      clearTimeout(state.autoAdvanceTimeout);
      state.autoAdvanceTimeout = null;
    };
    const bump = (influence = 0) => {
      clearAdvanceInterval();
      state.direction = Math.sign(influence);
      state.times.unshift(Date.now());
      while (state.times.length > maxSpan) {
        state.times.pop();
      }
      const observedRate = getAvgRateFromTimes(state.times, autoAdvanceOptions);
      if (observedRate >= minRate) {
        state.rate = Math.min(observedRate, maxRate);
        if (allowAutoStart) {
          state.isPaused = false;
          next();
        }
      } else {
        pause();
      }
      if (isDebugging) console.log('bump auto', {influence, ...state});
    };
    const next = () => {
      if (isDebugging) console.log('next auto', state);
      if (!state.isPaused && state.direction !== 0) {
        changeImage({position: state.direction, size: -1});
      }
      if (state.rate > 0) {
        const delay = 1000/state.rate;
        state.autoAdvanceTimeout = setTimeout(next, delay);
      }
    };
    const start = () => {
      if (state.rate === 0) {
        state.rate = startRate;
        if (state.direction === 0) {
          state.direction = 1;
        }
      }
      state.isPaused = false;
      next();
    };
    const pause = () => {
      state.isPaused = true;
      clearAdvanceInterval();
    };
    const stop = () => {
      pause();
      state.rate = 0;
      state.direction = 0;
      state.times = [];
    };
    const togglePause = () => {
      if (state.isPaused) {
        start();
      } else {
        pause();
      }
    };
    return { bump, start, pause, stop, togglePause, state, };
  };
  const autoAdvance = createAutoAdvance(options);
  const handleKey = (e) => {
    if (e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey) {
      return; // No modifiers, currently
    }
    const delta = {
      position: 0,
      size: 0,
    };
    switch(e.code) {
      case "Escape":
        autoAdvance.stop();
        break;
      case "Space":
        allowAutoAdvance && autoAdvance.togglePause();
        break;
      case "ArrowLeft":
        delta.position = -1;
        break;
      case "ArrowRight":
        delta.position = 1;
        break;
      case "ArrowUp":
        delta.size = 1;
        break;
      case "ArrowDown":
        delta.size = -1;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (delta.position !== 0 || delta.size !== 0) {
      changeImage(delta, {withIntent: true});
    }
  };
  const CLASS_GALLERY_HOOKED = 'with-gallery-control';
  const CLASS_GALLERY_CREATED = 'by-gallery-control';
  const init = () => {
    if (document.body.classList.contains(CLASS_GALLERY_HOOKED)) {
      console.error(`Gallery Control is already initialized.`);
      return false;
    }
    const img = getImage();
    if (!img) {
      return;
    }
    document.body.classList.add(CLASS_GALLERY_HOOKED);
    const style = document.createElement('style');
    style.classList.add(CLASS_GALLERY_CREATED);
    style.innerHTML =
      'img {' +
        'object-fit: contain;' +
        'width: 100vw;' +
        'height: 100vh;' +
        'transition-property: opacity;' +
        'transition-duration: 2s;' +
      '}'+
      '.hide-cursor {' +
        'cursor: none;' +
      '}' +
      '';
      // WISH (B) 2024-02-08 Enable zooming in, but still fit thumbnail and full to window normally. Might not be a CSS solution.
    document.body.appendChild(style);
    img.addEventListener('error', handleImageError);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKey);
    return {
      init,
      unset,
      getImage,
      changeImage,
      autoAdvance,
    };
  };
  const unset = () => {
    // Undo init.
    document.body.querySelectorAll(`.${CLASS_GALLERY_CREATED}`)
      .forEach((element) => element.parentElement.removeChild(element));
    const img = getImage();
    if (img) {
      img.removeEventListener('error', handleImageError);
    }
    window.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('keydown', handleKey);
    document.body.classList.remove(CLASS_GALLERY_HOOKED, CLASS_HIDE_CURSOR);
  };
  return init();
})();
