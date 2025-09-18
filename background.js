let processingTabId = null;

chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
    console.log('バックグラウンドスクリプトでメッセージを受信:', request.action);
    
    if (request.action === 'startProcessing') {
        console.log('処理開始リクエストを受信 - タブID:', request.tabId);
        processingTabId = request.tabId;
        
        // まずコンテンツスクリプトが注入されているか確認
        try {
            await chrome.scripting.executeScript({
                target: { tabId: processingTabId },
                files: ['content_multipage.js']
            });
            console.log('コンテンツスクリプトを注入しました');
        } catch (error) {
            console.log('コンテンツスクリプトは既に注入済みまたは注入エラー:', error);
        }
        
        chrome.storage.local.set({
            isProcessing: true,
            progress: 0,
            total: 0
        });
        
        console.log('コンテンツスクリプトにメッセージを送信します');
        chrome.tabs.sendMessage(processingTabId, {
            action: 'startContentProcessing',
            onlyPublic: request.onlyPublic,
            editMode: request.editMode,
            insertText: request.insertText,
            searchText: request.searchText,
            pageMode: request.pageMode,
            startPage: request.startPage,
            endPage: request.endPage,
            specificPages: request.specificPages
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('コンテンツスクリプトへのメッセージ送信エラー:', chrome.runtime.lastError);
                chrome.runtime.sendMessage({
                    action: 'error',
                    message: 'コンテンツスクリプトとの接続に失敗しました: ' + chrome.runtime.lastError.message
                });
            } else if (!response) {
                console.error('コンテンツスクリプトからの応答がありません');
                chrome.runtime.sendMessage({
                    action: 'error',
                    message: 'コンテンツスクリプトが応答しませんでした'
                });
            } else {
                console.log('コンテンツスクリプトとの接続成功:', response);
            }
        });
        
        sendResponse({ success: true });
        
    } else if (request.action === 'stopProcessing') {
        if (processingTabId) {
            try {
                chrome.tabs.sendMessage(processingTabId, {
                    action: 'stopContentProcessing'
                });
            } catch (error) {
                console.error('停止メッセージ送信エラー:', error);
            }
        }
        
        chrome.storage.local.set({
            isProcessing: false
        });
        
        sendResponse({ success: true });
        
    } else if (request.action === 'updateProgress') {
        chrome.storage.local.set({
            progress: request.progress,
            total: request.total
        });
        
        chrome.runtime.sendMessage({
            action: 'updateProgress',
            progress: request.progress,
            total: request.total
        });
        
    } else if (request.action === 'updatePageProgress') {
        chrome.runtime.sendMessage({
            action: 'updatePageProgress',
            currentPage: request.currentPage,
            totalPages: request.totalPages,
            phase: request.phase
        });
        
    } else if (request.action === 'hidePageProgress') {
        chrome.runtime.sendMessage({
            action: 'hidePageProgress'
        });
        
    } else if (request.action === 'processingComplete') {
        chrome.storage.local.set({
            isProcessing: false
        });
        
        chrome.runtime.sendMessage({
            action: 'processingComplete'
        });
        
        processingTabId = null;
        
    } else if (request.action === 'processingStopped') {
        chrome.storage.local.set({
            isProcessing: false
        });
        
        chrome.runtime.sendMessage({
            action: 'processingStopped'
        });
        
        processingTabId = null;
        
    } else if (request.action === 'error') {
        chrome.storage.local.set({
            isProcessing: false
        });
        
        chrome.runtime.sendMessage({
            action: 'error',
            message: request.message
        });
        
        processingTabId = null;
    }
    
    return true;
});

chrome.tabs.onRemoved.addListener(function(tabId) {
    if (tabId === processingTabId) {
        chrome.storage.local.set({
            isProcessing: false
        });
        processingTabId = null;
    }
});

chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.local.set({
        isProcessing: false,
        progress: 0,
        total: 0
    });
});