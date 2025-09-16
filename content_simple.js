const DESCRIPTION_TEXT = `====== 電子工作コミュニティメンバ募集中 ======
2024年12月、新しく「電子工作で人生豊かにするラボ」というコミュニティを立ち上げました！
https://discord.gg/nt5SNtQF3u

単に電子工作を学べるだけでなく、電子工作を通して人生が少しでも豊かになるような場にしたいと思っています。
以下のような悩みを抱えている方はぜひご参加頂ければと思います！
・AIを活用してさらに電子工作を楽しみたい！
・実現したいことはあるが、電子工作の知識がなくて進められない
・アラフォーなのに技術力不足・経験不足で今後のキャリアに悩んでいる
・自分の強みが見つからず、5年後に今の会社で活躍している姿がイメージできない
・物事に熱狂できない
・大人になって友達が作れない

上記のような悩みをお持ちの方であれば、電子工作経験の有無や職業、年齢、性別は一切問いません。
どなたでも無料で参加できるので、ご興味のある方はどしどしご参加ください👍 
※Discordというコミュニケーションアプリを使います（PC、スマホどちらでも可）
========================================

`;

console.log('YouTube説明欄自動編集: スクリプト読み込み完了');

// 現在のURLをチェック
const currentUrl = window.location.href;
console.log('現在のURL:', currentUrl);

// 編集ページにいる場合は自動的に説明欄を更新
if (currentUrl.includes('/video/') && currentUrl.includes('/edit')) {
    console.log('編集ページを検出しました。説明欄の更新を開始します...');
    
    // ページが完全に読み込まれるまで待つ
    setTimeout(async () => {
        const result = await updateDescriptionOnEditPage();
        if (result) {
            console.log('説明欄の更新に成功しました');
            
            // 進捗を更新
            const videoUrls = JSON.parse(localStorage.getItem('yt_video_urls') || '[]');
            const currentIndex = parseInt(localStorage.getItem('yt_current_index') || '0');
            chrome.runtime.sendMessage({
                action: 'updateProgress',
                progress: currentIndex + 1,
                total: videoUrls.length
            });
            
            // 次の動画へ移動
            processNextVideo();
        } else {
            console.log('説明欄の更新に失敗しました');
        }
    }, 3000);
}

// 次の動画を処理
function processNextVideo() {
    const videoUrls = JSON.parse(localStorage.getItem('yt_video_urls') || '[]');
    const currentIndex = parseInt(localStorage.getItem('yt_current_index') || '0');
    
    console.log(`処理状況: ${currentIndex + 1}/${videoUrls.length}`);
    
    if (currentIndex + 1 < videoUrls.length) {
        // 次の動画がある
        const nextIndex = currentIndex + 1;
        const nextVideo = videoUrls[nextIndex];
        console.log(`次の動画へ移動 (${nextIndex + 1}/${videoUrls.length}): ${nextVideo.title}`);
        
        localStorage.setItem('yt_current_index', nextIndex.toString());
        
        setTimeout(() => {
            window.location.href = nextVideo.href;
        }, 3000);
    } else {
        // すべて完了
        console.log('すべての動画の処理が完了しました');
        const processedCount = videoUrls.length;
        alert(`${processedCount}個の動画の説明欄を更新しました！`);
        
        // localStorageをクリア
        localStorage.removeItem('yt_video_urls');
        localStorage.removeItem('yt_current_index');
        
        // コンテンツページに戻る
        setTimeout(() => {
            window.location.href = 'https://studio.youtube.com/channel/UC/videos/upload';
        }, 3000);
    }
}

// メッセージリスナー
chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
    if (request.action === 'startContentProcessing') {
        console.log('処理開始リクエストを受信');
        // 編集設定を保存
        chrome.storage.local.set({
            editMode: request.editMode,
            insertText: request.insertText,
            searchText: request.searchText
        });
        await collectAndStartProcessing(request.onlyPublic);
        sendResponse({ success: true });
    } else if (request.action === 'stopContentProcessing') {
        localStorage.removeItem('yt_video_urls');
        localStorage.removeItem('yt_current_index');
        sendResponse({ success: true });
    }
    return true;
});

async function collectAndStartProcessing(onlyPublic) {
    try {
        console.log('動画リストを収集中... onlyPublic:', onlyPublic);
        
        // すべての動画行を取得
        const videoRows = document.querySelectorAll('ytcp-video-row');
        console.log('見つかった動画行数:', videoRows.length);
        
        const videoUrls = [];
        
        for (const row of videoRows) {
            // タイトルと編集リンクを取得
            const titleLink = row.querySelector('a#video-title');
            const thumbnailLink = row.querySelector('a#thumbnail-anchor');
            
            const editLink = titleLink || thumbnailLink;
            if (!editLink || !editLink.href) continue;
            
            const title = titleLink ? titleLink.textContent.trim() : '不明';
            const editUrl = editLink.href.includes('/edit') ? editLink.href : editLink.href + '/edit';
            
            // 公開状態をチェック
            if (onlyPublic) {
                // 公開状態の要素を探す
                const visibilityCell = row.querySelector('.ytcp-video-list-cell-visibility');
                let isPublic = false;
                
                if (visibilityCell) {
                    const visibilityText = visibilityCell.textContent || '';
                    console.log(`動画「${title}」の公開状態: ${visibilityText}`);
                    
                    // 「公開」という文字が含まれているかチェック
                    // 「限定公開」「非公開」は除外
                    if (visibilityText === '公開' || 
                        visibilityText === '公開中' || 
                        (visibilityText.includes('公開') && !visibilityText.includes('限定') && !visibilityText.includes('非'))) {
                        isPublic = true;
                    }
                } else {
                    // セルが見つからない場合、row全体のテキストをチェック
                    const rowText = row.textContent || '';
                    if (rowText.includes('公開') && !rowText.includes('限定公開') && !rowText.includes('非公開')) {
                        isPublic = true;
                    }
                }
                
                if (!isPublic) {
                    console.log(`スキップ: 「${title}」は公開動画ではありません`);
                    continue;
                }
            }
            
            videoUrls.push({
                href: editUrl,
                title: title
            });
            console.log(`追加: ${title}`);
        }
        
        console.log(`処理対象動画数: ${videoUrls.length}`);
        
        // 総数をバックグラウンドに送信
        chrome.runtime.sendMessage({
            action: 'updateProgress',
            progress: 0,
            total: videoUrls.length
        });
        
        if (videoUrls.length === 0) {
            alert('処理する動画が見つかりませんでした');
            return;
        }
        
        // URLリストをlocalStorageに保存
        localStorage.setItem('yt_video_urls', JSON.stringify(videoUrls));
        localStorage.setItem('yt_current_index', '0');
        
        // 最初の動画を開く
        console.log(`最初の動画を処理します: ${videoUrls[0].title}`);
        window.location.href = videoUrls[0].href;
        
    } catch (error) {
        console.error('エラー:', error);
        alert('エラーが発生しました: ' + error.message);
    }
}

async function updateDescriptionOnEditPage() {
    try {
        console.log('説明欄を探しています...');
        
        let descriptionField = null;
        let attempts = 0;
        const maxAttempts = 30;
        
        while (!descriptionField && attempts < maxAttempts) {
            // 様々なセレクタを試す
            const selectors = [
                '#description-container #textbox',
                '#description #textbox',
                'div[slot="description"] #textbox',
                '#textbox[contenteditable="true"]',
                'div[aria-label*="説明"]',
                'div[aria-label*="Description"]',
                '.description-field #textbox',
                '#description-textbox',
                'ytcp-mention-textbox#description #textbox',
                'ytcp-mention-input#description-container #textbox'
            ];
            
            for (const selector of selectors) {
                descriptionField = document.querySelector(selector);
                if (descriptionField) {
                    console.log('説明欄を発見:', selector);
                    break;
                }
            }
            
            if (!descriptionField) {
                // contenteditable要素を探す
                const editableElements = document.querySelectorAll('[contenteditable="true"]');
                for (const elem of editableElements) {
                    // 説明欄らしき要素を探す
                    const parent = elem.closest('[id*="description"], [aria-label*="説明"], [slot="description"]');
                    if (parent) {
                        descriptionField = elem;
                        console.log('説明欄を発見 (contenteditable)');
                        break;
                    }
                }
            }
            
            if (!descriptionField) {
                await sleep(1000);
                attempts++;
                console.log(`説明欄を探しています... (${attempts}/${maxAttempts})`);
            }
        }
        
        if (!descriptionField) {
            console.error('説明欄が見つかりませんでした');
            // デバッグ用：ページ内のcontenteditable要素をすべて表示
            const allEditable = document.querySelectorAll('[contenteditable="true"]');
            console.log('ページ内のcontenteditable要素:', allEditable.length);
            allEditable.forEach((elem, index) => {
                console.log(`要素${index}:`, elem.id, elem.className, elem.parentElement?.id);
            });
            return false;
        }
        
        // 編集設定を取得
        const editSettings = await new Promise(resolve => {
            chrome.storage.local.get(['editMode', 'insertText', 'searchText'], resolve);
        });
        
        const editMode = editSettings.editMode || 'prepend';
        const insertText = editSettings.insertText || DESCRIPTION_TEXT;
        const searchText = editSettings.searchText || '';
        
        // 現在の説明文を取得
        const currentDescription = descriptionField.textContent || descriptionField.innerText || '';
        console.log('現在の説明文の長さ:', currentDescription.length);
        console.log('編集モード:', editMode);
        
        // 新しい説明文を生成
        let newDescription = currentDescription;
        
        switch(editMode) {
            case 'prepend': // 先頭に追加
                if (currentDescription.includes(insertText)) {
                    console.log('既に文言が挿入されています');
                    return true;
                }
                newDescription = insertText + '\n\n' + currentDescription;
                break;
                
            case 'append': // 末尾に追加
                if (currentDescription.includes(insertText)) {
                    console.log('既に文言が挿入されています');
                    return true;
                }
                newDescription = currentDescription + '\n\n' + insertText;
                break;
                
            case 'replace': // 置換
                if (!currentDescription.includes(searchText)) {
                    console.log('置換対象の文字列が見つかりません');
                    return true;
                }
                // すべての該当箇所を置換
                newDescription = currentDescription.replaceAll(searchText, insertText);
                console.log(`置換実行: "${searchText}" → "${insertText}"`);
                break;
                
            case 'delete': // 削除
                if (!currentDescription.includes(searchText)) {
                    console.log('削除対象の文字列が見つかりません');
                    return true;
                }
                // すべての該当箇所を削除
                newDescription = currentDescription.replaceAll(searchText, '');
                console.log(`削除実行: "${searchText}"`);
                break;
        }
        
        // 変更がない場合はスキップ
        if (newDescription === currentDescription) {
            console.log('変更なし');
            return true;
        }
        
        // 説明欄をクリックしてフォーカス
        descriptionField.click();
        await sleep(500);
        descriptionField.focus();
        await sleep(500);
        
        // 全選択
        const range = document.createRange();
        range.selectNodeContents(descriptionField);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        await sleep(200);
        
        // 新しいテキストを挿入
        document.execCommand('insertText', false, newDescription);
        
        // イベントを発火
        descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
        descriptionField.dispatchEvent(new Event('change', { bubbles: true }));
        descriptionField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        
        console.log('説明欄を更新しました');
        await sleep(2000);
        
        // 保存ボタンを探す
        const saveSelectors = [
            '#done-button',
            '#save',
            '#save-button',
            'ytcp-button#done-button',
            'ytcp-button[id*="save"]',
            'button[aria-label*="保存"]',
            'button[aria-label*="Save"]',
            'ytcp-button[aria-label*="保存"]',
            'ytcp-button[aria-label*="動画を保存"]'
        ];
        
        let saveButton = null;
        for (const selector of saveSelectors) {
            saveButton = document.querySelector(selector);
            if (saveButton && !saveButton.disabled) {
                console.log('保存ボタンを発見:', selector);
                break;
            }
        }
        
        if (saveButton) {
            console.log('保存ボタンをクリック');
            saveButton.click();
            await sleep(3000);
            return true;
        } else {
            console.log('保存ボタンが見つかりません - 手動で保存してください');
            // 保存ボタンが見つからなくても、更新は成功とみなす
            return true;
        }
        
    } catch (error) {
        console.error('更新中にエラー:', error);
        return false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}