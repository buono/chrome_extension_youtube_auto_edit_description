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

let isProcessing = false;
let shouldStop = false;
let processedVideos = new Set(); // 処理済み動画のIDを記録

chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
    if (request.action === 'startContentProcessing') {
        shouldStop = false;
        isProcessing = true;
        processedVideos.clear();
        await processAllVideos(request.onlyPublic);
        sendResponse({ success: true });
    } else if (request.action === 'stopContentProcessing') {
        shouldStop = true;
        isProcessing = false;
        sendResponse({ success: true });
    }
    return true;
});

async function processAllVideos(onlyPublic) {
    try {
        console.log('処理開始 - onlyPublic:', onlyPublic);
        let processedCount = 0;
        let totalVideos = 0;
        
        // 現在のページの動画を取得
        await waitForContentLoad();
        
        // すべての動画行を取得
        let videoRows = document.querySelectorAll('ytcp-video-row');
        console.log('見つかった動画数:', videoRows.length);
        
        if (videoRows.length === 0) {
            throw new Error('動画が見つかりません。YouTube Studioのコンテンツページを開いてください。');
        }
        
        // 各動画に対して処理
        for (let i = 0; i < videoRows.length; i++) {
            if (shouldStop) break;
            
            // ページを再読み込みして最新の要素を取得
            await sleep(1000);
            videoRows = document.querySelectorAll('ytcp-video-row');
            if (i >= videoRows.length) break;
            
            const row = videoRows[i];
            console.log(`動画 ${i + 1}/${videoRows.length} を処理中...`);
            
            // 動画IDを取得
            const videoLink = row.querySelector('a#video-title, a[id*="video-title"]');
            if (!videoLink) {
                console.log('動画リンクが見つかりません');
                continue;
            }
            
            const videoUrl = videoLink.href;
            const videoId = videoUrl.match(/\/video\/([^\/]+)/)?.[1];
            
            if (!videoId) {
                console.log('動画IDを取得できません');
                continue;
            }
            
            // 既に処理済みの場合はスキップ
            if (processedVideos.has(videoId)) {
                console.log('既に処理済みの動画です');
                continue;
            }
            
            // タイトルを取得
            const title = videoLink.textContent.trim();
            console.log('動画タイトル:', title);
            
            // 公開状態をチェック
            if (onlyPublic) {
                const rowText = row.textContent || '';
                if (!rowText.includes('公開')) {
                    console.log('非公開動画のためスキップ');
                    continue;
                }
            }
            
            totalVideos++;
            
            // メニューボタンを探す（より広範なセレクタを使用）
            let menuButton = null;
            
            // 方法1: アイコンボタンを探す
            const iconButtons = row.querySelectorAll('ytcp-icon-button, button');
            for (const button of iconButtons) {
                const ariaLabel = button.getAttribute('aria-label') || '';
                const icon = button.querySelector('[icon*="more"], [icon*="dots"]');
                
                if (ariaLabel.includes('その他') || ariaLabel.includes('More') || 
                    ariaLabel.includes('オプション') || ariaLabel.includes('options') || icon) {
                    menuButton = button;
                    break;
                }
            }
            
            // 方法2: 最後のボタンを試す（通常メニューボタンは最後にある）
            if (!menuButton) {
                const buttons = row.querySelectorAll('button');
                if (buttons.length > 0) {
                    menuButton = buttons[buttons.length - 1];
                }
            }
            
            if (menuButton) {
                console.log('メニューボタンをクリック試行');
                menuButton.click();
                await sleep(1500);
                
                // メニュー内の「編集」オプションを探す（より広範なセレクタ）
                let editOption = document.querySelector('[test-id="EDIT"]') ||
                                document.querySelector('[aria-label*="編集"]') ||
                                document.querySelector('[aria-label*="Edit"]') ||
                                document.querySelector('tp-yt-paper-item[role="option"]');
                
                // メニューアイテムを全て確認
                if (!editOption) {
                    const menuItems = document.querySelectorAll('tp-yt-paper-item, [role="menuitem"], [role="option"]');
                    for (const item of menuItems) {
                        const text = item.textContent || '';
                        if (text.includes('編集') || text.includes('Edit')) {
                            editOption = item;
                            break;
                        }
                    }
                }
                
                if (editOption) {
                    console.log('編集オプションをクリック');
                    editOption.click();
                    await sleep(5000); // 編集ページが開くまで待つ
                    
                    // 編集ページで説明欄を更新
                    const updated = await updateDescription();
                    
                    if (updated) {
                        processedVideos.add(videoId);
                        processedCount++;
                        chrome.runtime.sendMessage({
                            action: 'updateProgress',
                            progress: processedCount,
                            total: totalVideos
                        });
                        
                        // コンテンツページに戻る
                        await goBackToContentList();
                        await sleep(3000);
                    }
                } else {
                    console.log('編集オプションが見つかりません - 直接編集ページを開きます');
                    // メニューを閉じる
                    document.body.click();
                    await sleep(500);
                    
                    // 直接編集ページへ移動
                    const editUrl = videoUrl.replace('/video/', '/video/edit/');
                    window.location.href = editUrl;
                    await sleep(5000);
                    
                    const updated = await updateDescription();
                    if (updated) {
                        processedVideos.add(videoId);
                        processedCount++;
                        await goBackToContentList();
                        await sleep(3000);
                    }
                }
            } else {
                console.log('メニューボタンが見つかりません - 直接編集ページへ');
                
                // 直接編集ページへ移動する代替手段
                const editUrl = videoUrl.replace('/video/', '/video/edit/');
                window.location.href = editUrl;
                await sleep(5000);
                
                const updated = await updateDescription();
                if (updated) {
                    processedVideos.add(videoId);
                    processedCount++;
                    chrome.runtime.sendMessage({
                        action: 'updateProgress',
                        progress: processedCount,
                        total: totalVideos
                    });
                    
                    await goBackToContentList();
                    await sleep(3000);
                }
            }
        }
        
        if (!shouldStop) {
            chrome.runtime.sendMessage({ action: 'processingComplete' });
        } else {
            chrome.runtime.sendMessage({ action: 'processingStopped' });
        }
        
    } catch (error) {
        console.error('処理中にエラーが発生しました:', error);
        chrome.runtime.sendMessage({
            action: 'error',
            message: error.message
        });
    }
    
    isProcessing = false;
}

async function updateDescription() {
    try {
        // 説明欄のテキストエリアを探す
        let descriptionField = null;
        let attempts = 0;
        
        while (!descriptionField && attempts < 20) {
            descriptionField = document.querySelector('#description-container #textbox') ||
                             document.querySelector('[aria-label*="説明"]') ||
                             document.querySelector('[aria-label*="Description"]') ||
                             document.querySelector('#description-textarea') ||
                             document.querySelector('div[slot="description"] #textbox') ||
                             document.querySelector('#description') ||
                             document.querySelector('[name="description"]');
            
            if (!descriptionField) {
                await sleep(500);
                attempts++;
            }
        }
        
        if (!descriptionField) {
            console.error('説明欄が見つかりません');
            return false;
        }
        
        console.log('説明欄を見つけました');
        
        // 現在の説明文を取得
        const currentDescription = descriptionField.textContent || descriptionField.value || '';
        
        // 既に文言が挿入されている場合はスキップ
        if (currentDescription.includes('電子工作コミュニティメンバ募集中')) {
            console.log('既に文言が挿入されています');
            return false;
        }
        
        // 新しい説明文を設定
        const newDescription = DESCRIPTION_TEXT + currentDescription;
        
        // フォーカスしてクリック
        descriptionField.focus();
        descriptionField.click();
        await sleep(500);
        
        // テキストを設定
        if (descriptionField.tagName === 'TEXTAREA' || descriptionField.tagName === 'INPUT') {
            descriptionField.value = newDescription;
            descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
            descriptionField.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // contenteditable要素の場合
            descriptionField.textContent = newDescription;
            descriptionField.innerText = newDescription;
            descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        console.log('説明欄を更新しました');
        await sleep(1000);
        
        // 保存ボタンをクリック
        const saveButton = document.querySelector('#save') ||
                          document.querySelector('#save-button') ||
                          document.querySelector('[aria-label*="保存"]') ||
                          document.querySelector('[aria-label*="Save"]') ||
                          document.querySelector('ytcp-button[id*="save"]') ||
                          document.querySelector('ytcp-button.save-button') ||
                          document.querySelector('button.save');
        
        if (saveButton) {
            console.log('保存ボタンをクリック');
            saveButton.click();
            await sleep(3000);
            return true;
        }
        
        console.log('保存ボタンが見つかりません');
        return false;
        
    } catch (error) {
        console.error('説明欄の更新中にエラー:', error);
        return false;
    }
}

async function goBackToContentList() {
    // コンテンツページに直接移動
    console.log('コンテンツページに戻ります');
    window.location.href = 'https://studio.youtube.com/channel/UC/videos/upload';
}

async function waitForContentLoad() {
    let attempts = 0;
    while (attempts < 30) {
        const videoRows = document.querySelectorAll('ytcp-video-row');
        if (videoRows.length > 0) {
            await sleep(1000); // 要素が完全にロードされるのを待つ
            return;
        }
        await sleep(500);
        attempts++;
    }
    throw new Error('動画リストの読み込みがタイムアウトしました');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}