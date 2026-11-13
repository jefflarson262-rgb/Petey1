function toggleNavDropdown(module) {
  var ddId = 'nav-dropdown-' + module;
  var btnId = 'nav-' + module + '-btn';
  var dd = document.getElementById(ddId);
  var btn = document.getElementById(btnId);
  var isOpen = dd && dd.classList.contains('open');
  closeNavDropdown();
  if (!isOpen && dd) {
    dd.classList.add('open');
    if (btn) btn.classList.add('open');
  }
}

function closeNavDropdown() {
  document.querySelectorAll('.nav-dropdown').forEach(function(dd) {
    dd.classList.remove('open');
  });
  document.querySelectorAll('.nav-settings-btn').forEach(function(btn) {
    btn.classList.remove('open');
  });
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  var isInsideNav = e.target.closest('.nav-settings-wrap');
  if (!isInsideNav) closeNavDropdown();
});

// Open settings modal scrolled to KB section
function openSettingsToKb() {
  openSettingsModal();
  setTimeout(function() {
    var kbSection = document.getElementById('kb-upload-zone');
    if (kbSection) kbSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}
