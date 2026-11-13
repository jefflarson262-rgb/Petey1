// Voice picker -- selectedVoiceName declared in main script
function populateVoicePicker() {
  var select = document.getElementById('petey-voice-select');
  if (!select || !window.speechSynthesis) return;
  var voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  // Sort: English first, then rest
  var en = voices.filter(function(v) { return /en/i.test(v.lang); });
  var other = voices.filter(function(v) { return !/en/i.test(v.lang); });
  var sorted = en.concat(other);

  select.innerHTML = '';
  sorted.forEach(function(v) {
    var opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = v.name + ' (' + v.lang + ')' + (v.localService ? '' : ' \u2014 online');
    if (selectedVoiceName && v.name === selectedVoiceName) opt.selected = true;
    select.appendChild(opt);
  });

  // Auto-select current preferred if none saved
  if (!selectedVoiceName) {
    var pref = voices.find(function(v) { return /en-US/i.test(v.lang) && /natural|neural|premium|enhanced|siri/i.test(v.name); })
      || voices.find(function(v) { return /en-US/i.test(v.lang) && v.localService === false; })
      || voices.find(function(v) { return /en-US/i.test(v.lang) && /male|david|guy|fred/i.test(v.name); })
      || voices.find(function(v) { return /en-US/i.test(v.lang); });
    if (pref) {
      select.value = pref.name;
      selectedVoiceName = pref.name;
    }
  }
}

// Voices load async on many browsers
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = populateVoicePicker;
  populateVoicePicker();
}

// Populate when settings modal opens
document.addEventListener('DOMContentLoaded', function() {
  var openBtn = document.getElementById('settings-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', function() {
      setTimeout(populateVoicePicker, 100);
    });
  }

  var preview = document.getElementById('petey-voice-preview');
  if (preview) {
    preview.addEventListener('click', function() {
      var select = document.getElementById('petey-voice-select');
      if (!select || !window.speechSynthesis) return;
      selectedVoiceName = select.value;
      window.speechSynthesis.cancel();
      var utter = new SpeechSynthesisUtterance("Hey, I'm Petey. I'll be with you all shift.");
      var voices = window.speechSynthesis.getVoices();
      var voice = voices.find(function(v) { return v.name === selectedVoiceName; });
      if (voice) utter.voice = voice;
      utter.rate = 1.02;
      window.speechSynthesis.speak(utter);
    });
  }

  // Save voice selection when settings saved
  var saveBtn = document.getElementById('settings-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var select = document.getElementById('petey-voice-select');
      if (select && select.value) {
        selectedVoiceName = select.value;
        localStorage.setItem('petey_voice', selectedVoiceName);
      }
    }, true);
  }

  // Restore saved voice
  var saved = localStorage.getItem('petey_voice');
  if (saved) selectedVoiceName = saved;
});
