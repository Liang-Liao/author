'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, MessageCircle, QrCode, Smartphone, X } from 'lucide-react';
import { useI18n } from '../lib/useI18n';

const RELEASE_API_URL = 'https://api.github.com/repos/YuanShiJiLoong/author/releases/latest';
const RELEASE_PAGE_URL = 'https://github.com/YuanShiJiLoong/author/releases/latest';
const QQ_GROUP_URL = 'https://qm.qq.com/q/kSZyifQ1Ne';

function createQrImageUrl(data, size = 160) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`;
}

function findAndroidAsset(assets = []) {
    return assets.find((asset) => {
        const name = String(asset?.name || '').toLowerCase();
        return name.startsWith('author-mobile-') && name.endsWith('.apk');
    }) || assets.find((asset) => String(asset?.name || '').toLowerCase().endsWith('.apk'));
}

export default function AndroidDownloadMenu() {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState(RELEASE_PAGE_URL);
    const rootRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        async function resolveLatestApk() {
            try {
                const response = await fetch(RELEASE_API_URL, {
                    headers: { Accept: 'application/vnd.github.v3+json' },
                    cache: 'no-store',
                });

                if (!response.ok) return;

                const release = await response.json();
                const asset = findAndroidAsset(release.assets);
                if (!cancelled && asset?.browser_download_url) {
                    setDownloadUrl(asset.browser_download_url);
                }
            } catch {
                // Keep the Release page fallback if GitHub API cannot be reached.
            }
        }

        resolveLatestApk();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!open) return undefined;

        const handlePointerDown = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [open]);

    const mobileQrImageUrl = createQrImageUrl(downloadUrl);
    const qqQrImageUrl = createQrImageUrl(QQ_GROUP_URL, 118);

    return (
        <div className="mobile-download-menu" ref={rootRef}>
            <button
                type="button"
                className={`mobile-download-trigger${open ? ' active' : ''}`}
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                aria-haspopup="dialog"
                title={t('mobileDownload.open')}
            >
                <Smartphone size={15} />
                <span className="mobile-download-trigger-label">{t('mobileDownload.trigger')}</span>
                <span className="mobile-download-trigger-badge">APK</span>
            </button>

            {open && (
                <div className="mobile-download-popover" role="dialog" aria-label={t('mobileDownload.title')}>
                    <button
                        type="button"
                        className="mobile-download-close"
                        onClick={() => setOpen(false)}
                        title={t('mobileDownload.close')}
                    >
                        <X size={15} />
                    </button>

                    <div className="mobile-download-heading">
                        <span className="mobile-download-heading-icon">
                            <Smartphone size={20} />
                        </span>
                        <div>
                            <h3>{t('mobileDownload.title')}</h3>
                            <p>{t('mobileDownload.subtitle')}</p>
                        </div>
                    </div>

                    <div className="mobile-download-feature-panel">
                        <p>{t('mobileDownload.featureIntro')}</p>
                        <div className="mobile-download-feature-grid">
                            <span>{t('mobileDownload.featureSync')}</span>
                            <span>{t('mobileDownload.featureOffline')}</span>
                            <span>{t('mobileDownload.featureTimeline')}</span>
                            <span>{t('mobileDownload.featureRelationship')}</span>
                        </div>
                    </div>

                    <div className="mobile-download-body">
                        <div className="mobile-download-qr">
                            <img src={mobileQrImageUrl} alt={t('mobileDownload.qrAlt')} />
                            <span>
                                <QrCode size={13} />
                                {t('mobileDownload.scanDownload')}
                            </span>
                        </div>

                        <div className="mobile-download-actions">
                            <a className="mobile-download-primary" href={downloadUrl}>
                                <Download size={15} />
                                {t('mobileDownload.downloadApk')}
                            </a>
                            <a
                                className="mobile-download-secondary"
                                href={RELEASE_PAGE_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <ExternalLink size={15} />
                                {t('mobileDownload.releasePage')}
                            </a>
                        </div>
                    </div>

                    <div className="mobile-download-community">
                        <div className="mobile-download-community-text">
                            <MessageCircle size={14} />
                            <span>{t('mobileDownload.qqGroup')}</span>
                        </div>
                        <div className="mobile-download-community-actions">
                            <a
                                href={QQ_GROUP_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mobile-download-qq-link"
                            >
                                {t('mobileDownload.joinQqGroup')}
                            </a>
                            <img src={qqQrImageUrl} alt={t('mobileDownload.qqQrAlt')} />
                        </div>
                    </div>

                    <p className="mobile-download-note">{t('mobileDownload.note')}</p>
                </div>
            )}
        </div>
    );
}
