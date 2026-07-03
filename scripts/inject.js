(function() {
  const NON_CODE_LANGUAGES = new Set(['plaintext', 'markdown', 'text', '']);

  function getMonaco() {
    if (typeof monaco !== 'undefined' && monaco.editor) {
      return monaco;
    }
    if (typeof window.monaco !== 'undefined' && window.monaco.editor) {
      return window.monaco;
    }
    return null;
  }

  function getLanguageId(model) {
    if (!model) return null;

    if (typeof model.getLanguageId === 'function') {
      return model.getLanguageId();
    }

    if (typeof model.getLanguageIdentifier === 'function') {
      const identifier = model.getLanguageIdentifier();
      return identifier ? identifier.language : null;
    }

    return null;
  }

  function isCodeModel(model) {
    const lang = getLanguageId(model);
    return lang && !NON_CODE_LANGUAGES.has(lang);
  }

  function getCodeEditorData() {
    const monacoInstance = getMonaco();
    if (!monacoInstance) {
      return null;
    }

    const editors = monacoInstance.editor.getEditors();
    if (editors && editors.length > 0) {
      const codeEditor = editors.find((editor) => isCodeModel(editor.getModel())) || editors[0];
      const model = codeEditor.getModel();

      return {
        code: codeEditor.getValue(),
        lang: getLanguageId(model)
      };
    }

    const models = monacoInstance.editor.getModels();
    if (models && models.length > 0) {
      const codeModel = models.find(isCodeModel) || models[0];

      return {
        code: codeModel.getValue(),
        lang: getLanguageId(codeModel)
      };
    }

    return null;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.action !== 'GET_CODE_AND_LANG') {
      return;
    }

    try {
      const editorData = getCodeEditorData();

      if (editorData) {
        window.postMessage({
          type: 'CODE_AND_LANG_RESPONSE',
          success: true,
          code: editorData.code,
          lang: editorData.lang
        }, '*');
        return;
      }

      window.postMessage({
        type: 'CODE_AND_LANG_RESPONSE',
        success: false,
        error: 'Monaco editor not found or not initialized yet.'
      }, '*');
    } catch (err) {
      window.postMessage({
        type: 'CODE_AND_LANG_RESPONSE',
        success: false,
        error: 'Error reading from Monaco: ' + err.message
      }, '*');
    }
  });
})();
