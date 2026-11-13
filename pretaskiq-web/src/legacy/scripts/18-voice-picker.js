// Voice picker -- selectedVoiceName declared in main script
//
// Petey is a man, so he should sound like one. A browser does NOT say whether a voice is male or female, so the "male" below is a GUESS from the
// voice's name (the first names that Microsoft, Apple and Google give their male English voices). It is not checked on every device. When a
// device has no such voice, or the guess is wrong, a voice can be picked by ear in Settings.
var PETEY_MALE_NAMES = /\b(guy|davis|andrew|brian|christopher|eric|roger|steffan|ryan|thomas|mark|david|james|george|richard|alex|aaron|evan|nathan|tom|daniel|arthur|oliver|gordon|lee)(multilingual)?\b|\bmale\b/i;
var PETEY_NATURAL_NAMES = /natural|neural|premium|enhanced|siri/i;
function peteyVoiceIsMale(v) { return !!v && PETEY_MALE_NAMES.test(v.name || ''); }       // (\b = whole word, so "Female" does not count as "male" and "Alexandra" does not count as "Alex")

// The best English voice this device offers: a male one if there is one (English (US) first, a natural-sounding one first), otherwise the most
// natural-sounding English (US) voice. Returns null when the device has no English voice.
function peteyBestVoice(voices) {
  var best = null, bestScore = -1;
  (voices || []).forEach(function (v) {
    if (!/^en[-_]/i.test(v.lang || '')) return;
    var score = (peteyVoiceIsMale(v) ? 100 : 0) + (/^en[-_]US/i.test(v.lang) ? 20 : 0) + (PETEY_NATURAL_NAMES.test(v.name || '') ? 10 : 0) + (v.localService === false ? 5 : 0);
    if (score > bestScore) { best = v; bestScore = score; }
  });
  return best;
}

// A voice counts as the person's own choice only when they picked it in Settings. (A voice that was filled in automatically and saved along with
// the other settings must not stop Petey from using a male voice.)
function peteyChosenVoiceName() {
  try { return localStorage.getItem('petey_voice_by_choice') === '1' ? (localStorage.getItem('petey_voice') || null) : null; } catch (e) { return null; }
}

var peteyVoiceDirty = false;      // the person changed the voice list since Settings was opened

function peteyVoiceNote() {
  var note = document.getElementById('petey-voice-note');
  if (!note) return;
  var natural = !!(window.PreTaskIQ && PreTaskIQ.voice && PreTaskIQ.voice.naturalVoice);
  note.textContent = natural
    ? 'The natural voice is switched on for this site, so Petey speaks with it (a male voice). The list below is the back-up voice for when it is not available.'
    : 'Automatic picks a male voice when this device has one (a guess from the voice’s name). If it sounds wrong, pick another and preview it.';
}

function populateVoicePicker() {
  var select = document.getElementById('petey-voice-select');
  if (!select || !window.speechSynthesis) return;
  var voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  // Sort: English male voices first, then other English voices, then the rest
  var en = voices.filter(function(v) { return /^en/i.test(v.lang); });
  var other = voices.filter(function(v) { return !/^en/i.test(v.lang); });
  var sorted = en.filter(peteyVoiceIsMale).concat(en.filter(function(v) { return !peteyVoiceIsMale(v); }), other);

  var chosen = peteyChosenVoiceName();
  select.innerHTML = '';
  var auto = document.createElement('option');
  auto.value = '';
  auto.textContent = 'Automatic (a male voice if this device has one)';
  select.appendChild(auto);
  sorted.forEach(function(v) {
    var opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = v.name + ' (' + v.lang + ')' + (v.localService ? '' : ' — online') + (peteyVoiceIsMale(v) ? ' — male' : '');
    select.appendChild(opt);
  });
  select.value = (chosen && voices.some(function(v) { return v.name === chosen; })) ? chosen : '';
  peteyVoiceNote();
}

// Voices load async on many browsers
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = populateVoicePicker;
  populateVoicePicker();
}

// Fill the list again each time Settings opens (the natural voice may have switched on since the page loaded, and a change made
// but never saved last time is dropped). The button that opens Settings is drawn later by the menu, so it is wrapped here instead.
if (typeof openSettingsModal === 'function') {
  var peteyOrigOpenSettings = openSettingsModal;
  openSettingsModal = function () {
    peteyVoiceDirty = false;
    try { populateVoicePicker(); } catch (e) {}
    return peteyOrigOpenSettings.apply(this, arguments);
  };
}

document.addEventListener('DOMContentLoaded', function() {
  var select = document.getElementById('petey-voice-select');
  if (select) select.addEventListener('change', function() { peteyVoiceDirty = true; });

  var preview = document.getElementById('petey-voice-preview');
  if (preview) {
    preview.addEventListener('click', function() {
      var sel = document.getElementById('petey-voice-select');
      var line = "Hey, I'm Petey. I'll be with you all shift.";
      var P = window.PreTaskIQ && PreTaskIQ.voice;
      if (P && P.naturalVoice) { P.prime(); P.speak(line, {}); return; }        // the natural voice is what Petey really uses, so that is what is previewed
      if (!sel || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var utter = new SpeechSynthesisUtterance(line);
      var voices = window.speechSynthesis.getVoices();
      var voice = sel.value ? voices.find(function(v) { return v.name === sel.value; }) : peteyBestVoice(voices);
      if (voice) { utter.voice = voice; utter.lang = voice.lang; }
      utter.rate = 1.02;
      window.speechSynthesis.speak(utter);
    });
  }

  // Save voice selection when settings saved (only if the person changed it)
  var saveBtn = document.getElementById('settings-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var sel = document.getElementById('petey-voice-select');
      if (!sel || !peteyVoiceDirty) return;
      peteyVoiceDirty = false;
      try {
        if (sel.value) { localStorage.setItem('petey_voice', sel.value); localStorage.setItem('petey_voice_by_choice', '1'); selectedVoiceName = sel.value; }
        else { localStorage.removeItem('petey_voice'); localStorage.removeItem('petey_voice_by_choice'); selectedVoiceName = null; }
      } catch (e) {}
    }, true);
  }

  // Restore the voice the person picked
  selectedVoiceName = peteyChosenVoiceName();
});
