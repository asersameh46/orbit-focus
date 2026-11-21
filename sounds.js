(function () {
  const STORAGE_KEY = "orbit-sound-effects-v1";
  const TONES = {
    tap: [{ frequency: 620, duration: 0.07 }],
    toggle: [{ frequency: 660, duration: 0.09 }, { frequency: 880, duration: 0.12, delay: 0.07 }],
    select: [{ frequency: 540, duration: 0.08 }, { frequency: 720, duration: 0.1, delay: 0.05 }],
    theme: [{ frequency: 440, duration: 0.12 }, { frequency: 587, duration: 0.12, delay: 0.08 }, { frequency: 784, duration: 0.16, delay: 0.16 }],
    start: [{ frequency: 520, duration: 0.1 }, { frequency: 780, duration: 0.16, delay: 0.06 }],
    pause: [{ frequency: 520, duration: 0.12 }, { frequency: 390, duration: 0.14, delay: 0.07 }],
    reset: [{ frequency: 440, duration: 0.1 }, { frequency: 330, duration: 0.13, delay: 0.06 }],
    message: [{ frequency: 690, duration: 0.1 }],
    reward: [{ frequency: 523, duration: 0.16 }, { frequency: 659, duration: 0.16, delay: 0.1 }, { frequency: 784, duration: 0.22, delay: 0.2 }],
    complete: [{ frequency: 523, duration: 0.2 }, { frequency: 659, duration: 0.2, delay: 0.12 }, { frequency: 784, duration: 0.2, delay: 0.24 }, { frequency: 1047, duration: 0.32, delay: 0.36 }]
  };
  let audioContext = null;
  let enabled = true;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) enabled = saved === "true";
  } catch (error) {
    console.error("Could not restore the sound preference.", error);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch (error) {
      console.error("Could not save the sound preference.", error);
    }
  }

  function play(name) {
    if (!enabled || !TONES[name]) return;

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    try {
      if (!audioContext) audioContext = new AudioContextConstructor();
      const context = audioContext;
      const begin = context.state === "suspended" ? context.resume() : Promise.resolve();
      begin.then(function () {
        if (!enabled) return;
        const now = context.currentTime;
        TONES[name].forEach(function (tone) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const startAt = now + (tone.delay || 0);
          const endAt = startAt + tone.duration;
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(tone.frequency, startAt);
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startAt);
          oscillator.stop(endAt + 0.01);
        });
      }).catch(function (error) {
        console.error("Could not play the sound effect.", error);
      });
    } catch (error) {
      console.error("Could not initialize sound effects.", error);
    }
  }

  window.OrbitSounds = {
    isEnabled: function () { return enabled; },
    setEnabled: setEnabled,
    play: play
  };
}());
