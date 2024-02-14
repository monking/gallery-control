((options = {}) => {
  const {
    imageSelector,
		thumbPattern,
		fullPattern,
		fullReplacetoThumb,
    waitForError,
		cursorTimeout,
    allowAutoAdvance,
  } = {
    imageSelector: 'img',
		thumbPattern: /^(.*\/)(thumb_)([^\/]+.jpg)/,
		fullPattern: /^(.*\/)([^\/]+.jpg)/,
		fullReplacetoThumb: '$1thumb_$2',
    waitForError: 1000,
		cursorTimeout: 1000,
    allowAutoAdvance: true,
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
	const changeImage = (deltas, options = {}) => {
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
		Object.keys(deltas).forEach((dimension) => {
			const delta = deltas[dimension];
			const sign = Math.sign(delta);
			if (sign === 0) return;
			switch(dimension) {
				case 'position':
					newUrl = advanceUrl(newUrl, delta);
					if (withIntent && allowAutoAdvance) {
						autoAdvance.bump(delta);
					}
					break;
				case 'size':
					newUrl = sign === 1 ? largerUrl(newUrl) : smallerUrl(newUrl);
					if (withIntent) {
						autoAdvance.pause();
					}
					break;
			}
		});
		if (newUrl !== currentUrl) {
			img.src = newUrl;
		}
		return img;
	};
  let errorCooldownTimeout = null;
  const handleImageError = () => {
    autoAdvance.stop();
    errorCooldownTimeout = setTimeout(() => {errorCooldownTimeout = null}, waitForError);
  };
  const handleMouseDown = (e) => {
    if (e.defaultPrevented) return;
    if (e.button === 1) {
			autoAdvance.togglePause();
      return;
    }
    // Normalize from -1 to 1
    const xNormalized = (e.clientX / window.innerWidth) * 2 - 1;
    const yNormalized = (e.clientY / window.innerHeight) * 2 - 1;
		const delta = {
			position: 0,
			size: 0,
		};
    if (Math.abs(xNormalized) > 0.5) {
      delta.position = Math.sign(xNormalized);
    } else if (Math.abs(yNormalized) > 0.5) {
      delta.size = Math.sign(-1 * yNormalized);
      // Invert vertical, so that top is negative.
    }
		changeImage(delta, {withIntent: true});
  };
  let isHidingMouse = false;
  let hideMouseTimeout = null;
  const handleMouseMove = (e) => {
    if (e.defaultPrevented) return;
    if (isHidingMouse) {
      document.body.classList.remove('hide-cursor');
      isHidingMouse = false;
    }
    clearTimeout(hideMouseTimeout);
    hideMouseTimeout = setTimeout(() => {
      document.body.classList.add('hide-cursor');
      isHidingMouse = true;
    }, cursorTimeout);
  };
  const createAutoAdvance = (options = {}) => {
    const autoAdvanceOptions = {
      // rates are in Hz
      startRate: 1,
      minRate: 0.25,
      maxRate: 10,
			minSpan: 3, // how many steps before auto takes on a rate
			maxSpan: 5,
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
      const influenceSign = Math.sign(influence);
      if (influenceSign !== 0) {
				if (influenceSign !== state.direction) {
					state.times.splice(0);
					if (state.direction === 0) {
						state.direction = influenceSign;
					} else {
						state.direction = 0;
					}
				}
      }
      if (state.direction !== 0) {
				state.times.unshift(Date.now());
				while (state.times.length > maxSpan) {
					state.times.pop();
				}
				const observedRate = getAvgRateFromTimes(state.times, autoAdvanceOptions);
				if (observedRate >= minRate) {
					state.rate = Math.min(observedRate, maxRate);
					state.isPaused = false;
					next();
				} else {
					state.rate = 0;
				}
      }
		};
    const next = () => {
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
			}
      next();
			state.isPaused = false;
    };
    const pause = () => {
      state.isPaused = true;
      clearAdvanceInterval();
    };
    const stop = () => {
      pause();
      state.rate = 0;
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
  const init = () => {
    const img = getImage();
    if (!img) {
      return;
    }
    const style = document.createElement('style');
    style.innerHTML =
      'img {' +
      '  object-fit: contain;' +
      '  width: 100vw;' +
      '  height: 100vh;' +
      '}'+
      '.hide-cursor {' +
      '  cursor: none;' +
      '}';
      // WISH (B) 2024-02-08 Enable zooming in, but still fit thumbnail and full to window normally. Might not be a CSS solution.
    document.body.appendChild(style);
    img.addEventListener('error', handleImageError);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    //window.addEventListener('wheel', handleWheel);
    window.addEventListener('keydown', handleKey);
    return {
			getImage,
      changeImage,
      autoAdvance,
    };
  }
  return init();
})({minSpan:2});
