// Copy-to-clipboard for the brew chip (hero) and the install code block.
// Progressive enhancement: the command text is selectable without JS; this
// just adds a one-click copy with brief "Copied" feedback.
(function () {
  function flash(el) {
    el.classList.add('is-copied');
    setTimeout(function () {
      el.classList.remove('is-copied');
    }, 1400);
  }

  function copy(text, el) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          flash(el);
        },
        function () {
          /* clipboard denied - nothing to do, text is still selectable */
        },
      );
    }
  }

  // Hero chip: the whole button copies its data-copy value.
  document.querySelectorAll('.copy-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      copy(chip.getAttribute('data-copy') || '', chip);
    });
  });

  // Install code block: the copy button copies the block's data-copy value.
  document.querySelectorAll('.codeblock').forEach(function (block) {
    var btn = block.querySelector('.codeblock__copy');
    if (!btn) return;
    btn.addEventListener('click', function () {
      copy(block.getAttribute('data-copy') || '', block);
    });
  });
})();
