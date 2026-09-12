CREATE UNIQUE INDEX IF NOT EXISTS idx_transfers_code_hash ON `transfers` (`code_hash`);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transfers_download_token ON `transfers` (`download_token`);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transfers_upload_token ON `transfers` (`upload_token`);
