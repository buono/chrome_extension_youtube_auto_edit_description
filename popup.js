let isProcessing = false;

document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusElement = document.getElementById('status');
    const progressElement = document.getElementById('progress');
    const totalElement = document.getElementById('total');
    const messageElement = document.getElementById('message');
    const onlyPublicCheckbox = document.getElementById('onlyPublic');
    const insertTextArea = document.getElementById('insertText');
    const searchTextArea = document.getElementById('searchText');
    const insertSection = document.getElementById('insertSection');
    const replaceSection = document.getElementById('replaceSection');
    const editModeRadios = document.getElementsByName('editMode');
    
    // 初期表示時のUI設定
    updateEditModeUI('prepend');

    // 保存された設定を読み込み
    chrome.storage.local.get(['isProcessing', 'progress', 'total', 'savedInsertText', 'savedSearchText', 'savedEditMode'], function(result) {
        if (result.isProcessing) {
            isProcessing = true;
            updateUI(true);
            if (result.progress !== undefined) {
                progressElement.textContent = result.progress;
            }
            if (result.total !== undefined) {
                totalElement.textContent = result.total;
            }
        }
        
        // 保存されたテキストを復元
        if (result.savedInsertText !== undefined) {
            insertTextArea.value = result.savedInsertText;
        }
        if (result.savedSearchText !== undefined) {
            searchTextArea.value = result.savedSearchText;
        }
        if (result.savedEditMode !== undefined) {
            document.querySelector(`input[name="editMode"][value="${result.savedEditMode}"]`).checked = true;
            updateEditModeUI(result.savedEditMode);
        }
    });

    // 編集モードの変更を監視
    editModeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            updateEditModeUI(this.value);
        });
    });

    // 編集モードUIの更新
    function updateEditModeUI(mode) {
        const searchLabel = replaceSection.querySelector('label[for="searchText"]');
        
        if (mode === 'replace' || mode === 'delete') {
            replaceSection.style.display = 'block';
            if (mode === 'delete') {
                insertSection.style.display = 'none';
                if (searchLabel) {
                    searchLabel.textContent = '削除する文字列';
                }
            } else {
                insertSection.style.display = 'block';
                if (searchLabel) {
                    searchLabel.textContent = '検索する文字列';
                }
            }
        } else {
            replaceSection.style.display = 'none';
            insertSection.style.display = 'block';
        }
    }

    // メッセージリスナー
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'updateProgress') {
            progressElement.textContent = request.progress;
            totalElement.textContent = request.total;
            statusElement.textContent = '処理中...';
            
            // 進捗を保存
            chrome.storage.local.set({
                progress: request.progress,
                total: request.total
            });
        } else if (request.action === 'processingComplete') {
            isProcessing = false;
            updateUI(false);
            statusElement.textContent = '完了';
            showMessage('すべての動画の処理が完了しました！', 'success');
            
            // 処理完了後、進捗をリセット
            chrome.storage.local.set({
                isProcessing: false,
                progress: 0,
                total: 0
            });
        } else if (request.action === 'processingStopped') {
            isProcessing = false;
            updateUI(false);
            statusElement.textContent = '停止済み';
            showMessage('処理を停止しました。', 'info');
            
            chrome.storage.local.set({
                isProcessing: false
            });
        } else if (request.action === 'error') {
            isProcessing = false;
            updateUI(false);
            statusElement.textContent = 'エラー';
            showMessage(request.message, 'error');
            
            chrome.storage.local.set({
                isProcessing: false
            });
        }
    });

    startBtn.addEventListener('click', async function() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url.includes('studio.youtube.com')) {
            showMessage('YouTube Studioのコンテンツページを開いてから実行してください。', 'error');
            return;
        }

        // 選択された編集モードを取得
        const selectedMode = document.querySelector('input[name="editMode"]:checked').value;
        const insertText = insertTextArea.value;
        const searchText = searchTextArea.value;

        // 設定を検証
        if (selectedMode === 'delete' && !searchText) {
            showMessage('削除する文字列を入力してください。', 'error');
            return;
        }
        if (selectedMode === 'replace' && (!searchText || !insertText)) {
            showMessage('検索する文字列と置換後の文字列を両方入力してください。', 'error');
            return;
        }
        if ((selectedMode === 'prepend' || selectedMode === 'append') && !insertText) {
            showMessage('挿入する文字列を入力してください。', 'error');
            return;
        }

        isProcessing = true;
        updateUI(true);
        statusElement.textContent = '処理中...';
        progressElement.textContent = '0';
        totalElement.textContent = '0';
        
        // 設定を保存
        chrome.storage.local.set({ 
            isProcessing: true,
            onlyPublic: onlyPublicCheckbox.checked,
            editMode: selectedMode,
            insertText: insertText,
            searchText: searchText,
            savedInsertText: insertText,
            savedSearchText: searchText,
            savedEditMode: selectedMode,
            progress: 0,
            total: 0
        });

        // バックグラウンドスクリプトにメッセージを送信
        chrome.runtime.sendMessage({
            action: 'startProcessing',
            tabId: tab.id,
            onlyPublic: onlyPublicCheckbox.checked,
            editMode: selectedMode,
            insertText: insertText,
            searchText: searchText
        });
    });

    stopBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: 'stopProcessing' });
        isProcessing = false;
        updateUI(false);
        statusElement.textContent = '停止中...';
    });

    function updateUI(processing) {
        startBtn.disabled = processing;
        stopBtn.disabled = !processing;
        onlyPublicCheckbox.disabled = processing;
        insertTextArea.disabled = processing;
        searchTextArea.disabled = processing;
        editModeRadios.forEach(radio => {
            radio.disabled = processing;
        });
    }

    function showMessage(text, type) {
        messageElement.textContent = text;
        messageElement.className = 'message ' + type;
        messageElement.style.display = 'block';
        
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 5000);
    }
});