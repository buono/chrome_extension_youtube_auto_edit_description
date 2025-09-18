let isProcessing = false;

document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusElement = document.getElementById('status');
    const progressElement = document.getElementById('progress');
    const totalElement = document.getElementById('total');
    const messageElement = document.getElementById('message');
    const pageProgressSection = document.getElementById('pageProgressSection');
    const currentPageElement = document.getElementById('currentPage');
    const totalPagesElement = document.getElementById('totalPages');
    const onlyPublicCheckbox = document.getElementById('onlyPublic');
    const insertTextArea = document.getElementById('insertText');
    const searchTextArea = document.getElementById('searchText');
    const insertSection = document.getElementById('insertSection');
    const replaceSection = document.getElementById('replaceSection');
    const editModeRadios = document.getElementsByName('editMode');
    const pageModeRadios = document.getElementsByName('pageMode');
    const rangeSection = document.getElementById('rangeSection');
    const specificSection = document.getElementById('specificSection');
    const startPageInput = document.getElementById('startPage');
    const endPageInput = document.getElementById('endPage');
    const specificPagesInput = document.getElementById('specificPages');
    
    // 初期表示時のUI設定
    updateEditModeUI('prepend');
    updatePageModeUI('all');

    // 保存された設定を読み込み
    chrome.storage.local.get(['isProcessing', 'progress', 'total', 'savedInsertText', 'savedSearchText', 'savedEditMode', 'savedPageMode', 'savedStartPage', 'savedEndPage', 'savedSpecificPages'], function(result) {
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
        if (result.savedPageMode !== undefined) {
            document.querySelector(`input[name="pageMode"][value="${result.savedPageMode}"]`).checked = true;
            updatePageModeUI(result.savedPageMode);
        }
        if (result.savedStartPage !== undefined) {
            startPageInput.value = result.savedStartPage;
        }
        if (result.savedEndPage !== undefined) {
            endPageInput.value = result.savedEndPage;
        }
        if (result.savedSpecificPages !== undefined) {
            specificPagesInput.value = result.savedSpecificPages;
        }
    });

    // 編集モードの変更を監視
    editModeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            updateEditModeUI(this.value);
        });
    });
    
    // ページモードの変更を監視
    pageModeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            updatePageModeUI(this.value);
        });
    });

    // 編集モードUIの更新
    function updateEditModeUI(mode) {
        const searchLabel = replaceSection.querySelector('label[for="searchText"]');
        const insertLabel = insertSection.querySelector('label[for="insertText"]');
        
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
                    searchLabel.textContent = '置換前の文字列（これを探して↓）';
                }
                if (insertLabel) {
                    insertLabel.textContent = '置換後の文字列（↑これに置き換える）';
                }
            }
        } else {
            replaceSection.style.display = 'none';
            insertSection.style.display = 'block';
            if (insertLabel) {
                insertLabel.textContent = '挿入する文字列';
            }
        }
    }
    
    // ページモードUIの更新
    function updatePageModeUI(mode) {
        rangeSection.style.display = mode === 'range' ? 'block' : 'none';
        specificSection.style.display = mode === 'specific' ? 'block' : 'none';
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
        } else if (request.action === 'updatePageProgress') {
            currentPageElement.textContent = request.currentPage;
            totalPagesElement.textContent = request.totalPages;
            pageProgressSection.style.display = 'block';
            
            if (request.phase === 'scanning') {
                statusElement.textContent = 'ページ数を確認中...';
            } else if (request.phase === 'collecting') {
                statusElement.textContent = '動画収集中...';
            }
        } else if (request.action === 'hidePageProgress') {
            pageProgressSection.style.display = 'none';
            statusElement.textContent = '動画処理中...';
        } else if (request.action === 'processingComplete') {
            isProcessing = false;
            updateUI(false);
            statusElement.textContent = '完了';
            pageProgressSection.style.display = 'none';
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
            pageProgressSection.style.display = 'none';
            showMessage('処理を停止しました。', 'info');
            
            chrome.storage.local.set({
                isProcessing: false
            });
        } else if (request.action === 'error') {
            isProcessing = false;
            updateUI(false);
            statusElement.textContent = 'エラー';
            pageProgressSection.style.display = 'none';
            showMessage(request.message, 'error');
            
            chrome.storage.local.set({
                isProcessing: false
            });
        }
    });

    startBtn.addEventListener('click', async function() {
        console.log('処理開始ボタンがクリックされました');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('現在のタブURL:', tab.url);
        
        if (!tab.url.includes('studio.youtube.com')) {
            console.log('YouTube Studio以外のページです');
            showMessage('YouTube Studioのコンテンツページを開いてから実行してください。', 'error');
            return;
        }
        
        console.log('YouTube Studioページを確認しました');

        // 選択された編集モードを取得
        const selectedMode = document.querySelector('input[name="editMode"]:checked').value;
        const insertText = insertTextArea.value;
        const searchText = searchTextArea.value;
        
        // ページ設定を取得
        const pageMode = document.querySelector('input[name="pageMode"]:checked').value;
        const startPage = parseInt(startPageInput.value) || 1;
        const endPage = parseInt(endPageInput.value) || 1;
        const specificPages = specificPagesInput.value;

        // 設定を検証
        if (selectedMode === 'delete' && !searchText) {
            showMessage('削除する文字列を入力してください。', 'error');
            return;
        }
        if (selectedMode === 'replace' && (!searchText || !insertText)) {
            showMessage('置換前の文字列と置換後の文字列を両方入力してください。', 'error');
            return;
        }
        if ((selectedMode === 'prepend' || selectedMode === 'append') && !insertText) {
            showMessage('挿入する文字列を入力してください。', 'error');
            return;
        }
        
        // ページ設定を検証
        if (pageMode === 'range' && startPage > endPage) {
            showMessage('開始ページは終了ページ以下にしてください。', 'error');
            return;
        }
        if (pageMode === 'specific' && !specificPages.trim()) {
            showMessage('ページ番号を入力してください。', 'error');
            return;
        }
        if (pageMode === 'specific') {
            const pages = specificPages.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p > 0);
            if (pages.length === 0) {
                showMessage('有効なページ番号を入力してください。', 'error');
                return;
            }
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
            pageMode: pageMode,
            startPage: startPage,
            endPage: endPage,
            specificPages: specificPages,
            savedInsertText: insertText,
            savedSearchText: searchText,
            savedEditMode: selectedMode,
            savedPageMode: pageMode,
            savedStartPage: startPage,
            savedEndPage: endPage,
            savedSpecificPages: specificPages,
            progress: 0,
            total: 0
        });

        // バックグラウンドスクリプトにメッセージを送信
        console.log('バックグラウンドスクリプトにメッセージを送信します:', {
            action: 'startProcessing',
            tabId: tab.id,
            editMode: selectedMode,
            pageMode: pageMode
        });
        
        chrome.runtime.sendMessage({
            action: 'startProcessing',
            tabId: tab.id,
            onlyPublic: onlyPublicCheckbox.checked,
            editMode: selectedMode,
            insertText: insertText,
            searchText: searchText,
            pageMode: pageMode,
            startPage: startPage,
            endPage: endPage,
            specificPages: specificPages
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('バックグラウンドスクリプトへのメッセージ送信エラー:', chrome.runtime.lastError);
                showMessage('バックグラウンドスクリプトとの接続に失敗しました: ' + chrome.runtime.lastError.message, 'error');
            } else {
                console.log('バックグラウンドスクリプトからの応答:', response);
            }
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
        startPageInput.disabled = processing;
        endPageInput.disabled = processing;
        specificPagesInput.disabled = processing;
        editModeRadios.forEach(radio => {
            radio.disabled = processing;
        });
        pageModeRadios.forEach(radio => {
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