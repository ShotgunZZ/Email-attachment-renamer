# Gmail Attachment Renamer

A Chrome extension that renames Gmail attachment downloads using a customizable pattern: YYYY-MM-DD_SenderName_OriginalFilename.

## Features

- Automatically renames Gmail attachment downloads
- Uses a customizable pattern including:
  - Email date (YYYY-MM-DD)
  - Sender name
  - Original filename
- Preserves file extensions
- Works with multiple attachments
- Handles special characters in filenames
- Visual download feedback
- Auto-recovery from extension context changes
- Works with both regular view and preview mode

## How It Works

This extension uses a passive approach to handle Gmail attachment downloads:

1. When you click a download button in Gmail, the extension detects the click
2. It lets Gmail handle the download naturally using its own system
3. The extension monitors for new downloads from Gmail
4. When a matching download starts, it's automatically renamed using your pattern
5. You'll receive a notification when the rename is complete

This passive approach makes the extension more reliable across different Gmail interfaces and attachment types.

## Installation

### From Chrome Web Store (Recommended)

1. [Coming soon]

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the extension directory
5. The extension is now installed and ready to use

## Usage

1. Navigate to Gmail in Chrome
2. Open an email with attachments
3. Click on any attachment to download normally
   - This works both in the regular email view and when clicking attachments from the inbox preview
4. The extension will detect the download and rename the file according to your pattern
5. A brief notification will appear confirming the successful rename
6. Find your renamed attachment in your default downloads folder

### Preview Mode

The extension also works with Gmail's preview mode:

1. Click on an attachment icon from your inbox view (without opening the full email)
2. When the preview dialog opens, use the download button there
3. The file will be renamed just like with regular downloads

## Customizing the Naming Pattern

1. Right-click the extension icon in the Chrome toolbar
2. Select "Options" from the menu
3. Customize the naming pattern using the available variables:
   - `YYYY-MM-DD` - Email date
   - `SenderName` - Name of the email sender
   - `OriginalFilename` - Original attachment filename
4. Click "Save" to apply your changes

## Troubleshooting

### If Downloads Aren't Being Renamed

1. Make sure the extension is enabled in `chrome://extensions/`
2. Try reloading both Gmail and the extension
3. Look for notifications when downloading (green for success, red for errors)
4. Enable debug mode (see below) to get more information

### Multiple Downloads Not Working

If only the first download in a session works:

1. The extension now has improved support for multiple downloads
2. Try hovering over each attachment before clicking to ensure Gmail shows the download button
3. After downloading one file, wait a moment (2-3 seconds) before downloading the next one
4. If navigating between emails, give Gmail a moment to fully load the new email
5. You don't need to refresh the page between downloads anymore with the latest version

### Problems When Navigating Between Emails

The extension now includes improved detection for Gmail navigation:

1. When you click on a different email, the extension automatically resets its tracking
2. If attachments aren't detected after switching emails, try hovering over them
3. If issues persist after navigating, refresh Gmail once to reset everything

### Debug Mode

If the extension isn't working as expected, you can enable debug mode:

1. While in Gmail, press `Alt+Shift+D` on Windows/Linux or `Option+Shift+D` on macOS to toggle debug mode
2. Open the browser console (F12 or Ctrl+Shift+J on Windows/Linux; Option+⌘+J on macOS) to see detailed logs
3. Try downloading an attachment again to see what's happening

Alternatively, add `?attachment-renamer-debug=1` to the Gmail URL to enable debug mode automatically.

### Common Issues

- **Extension not detecting attachments**: Gmail's interface may have changed. Enable debug mode to see if the extension is detecting the attachments.
- **Renamed download has wrong extension**: Please report this issue with details about the file type.
- **Getting download errors**: Check the browser console for detailed error messages.
- **"Download X failed: USER_CANCELED"**: This is normal and expected - the extension cancels the original download to create a renamed one.
- **"Download X failed: SERVER_BAD_CONTENT"**: This can occur if Gmail's download system has timing issues. Try downloading again.

### "Extension context invalidated" Error

If you see a yellow notification stating "Extension needs to be reconnected" or a console error about "Extension context invalidated":

1. **Wait for auto-recovery**: The extension will attempt to automatically recover the connection up to 3 times
2. **Reload Gmail if needed**: If auto-recovery doesn't work, simply refresh the Gmail page
3. **Check extension status**: Go to `chrome://extensions/` and ensure the extension is enabled
4. **Extension updates**: If the extension was recently updated, you may see this error once

This error occurs when Chrome updates, reloads, or otherwise changes the extension while Gmail is open. The extension now includes auto-recovery to minimize the need for manual intervention.

## Privacy

This extension:
- Does NOT collect or transmit any of your data
- Works entirely locally on your computer
- Requires Gmail permissions only to detect attachments and extract metadata
- Requires download permissions to rename your files

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 