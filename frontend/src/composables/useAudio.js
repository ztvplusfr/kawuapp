// Audio chime synthesizer using Web Audio API

export function playWelcomeSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    
    // Warm rising cinematic chime chords: C#4, F4, G#4, C5, D#5
    const notes = [277.18, 349.23, 415.30, 523.25, 622.25]
    const now = ctx.currentTime
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + i * 0.08)
      
      gain.gain.setValueAtTime(0, now + i * 0.08)
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.08 + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 1.8)
      
      osc.connect(gain)
      gain.connect(ctx.destination)
      
      osc.start(now + i * 0.08)
      osc.stop(now + i * 0.08 + 2.0)
    })
  } catch (e) {
    console.error('Audio non disponible:', e)
  }
}
