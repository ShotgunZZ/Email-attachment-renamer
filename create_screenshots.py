from PIL import Image, ImageDraw, ImageFont
import os

# Create screenshots directory if it doesn't exist
os.makedirs('screenshots', exist_ok=True)

# Define colors
GMAIL_BG = (255, 255, 255)
GMAIL_HEADER = (242, 242, 242)
GMAIL_RED = (219, 68, 55)
GMAIL_TEXT = (32, 33, 36)
GMAIL_LIGHT_TEXT = (95, 99, 104)
GMAIL_HOVER = (242, 245, 245)
GMAIL_BORDER = (218, 220, 224)
GMAIL_BLUE = (66, 133, 244)
GMAIL_FOLDER = (241, 243, 244)

# Helper function to create rounded rectangle
def rounded_rectangle(draw, xy, radius, fill=None, outline=None):
    x0, y0, x1, y1 = xy
    diameter = radius * 2
    
    # Draw the rectangle
    draw.rectangle([(x0, y0 + radius), (x1, y1 - radius)], fill=fill, outline=outline)
    draw.rectangle([(x0 + radius, y0), (x1 - radius, y1)], fill=fill, outline=outline)
    
    # Draw the corners
    draw.pieslice([(x0, y0), (x0 + diameter, y0 + diameter)], 180, 270, fill=fill, outline=outline)
    draw.pieslice([(x1 - diameter, y0), (x1, y0 + diameter)], 270, 360, fill=fill, outline=outline)
    draw.pieslice([(x0, y1 - diameter), (x0 + diameter, y1)], 90, 180, fill=fill, outline=outline)
    draw.pieslice([(x1 - diameter, y1 - diameter), (x1, y1)], 0, 90, fill=fill, outline=outline)

# Function to create a Gmail-like message box
def create_gmail_email(draw, x, y, width, height, from_name, from_email, subject, attachment_name, date):
    # Email container
    rounded_rectangle(draw, (x, y, x + width, y + height), 8, fill=GMAIL_BG, outline=GMAIL_BORDER)
    
    # Sender info
    font_sender = ImageFont.truetype("Arial.ttf", 14) if os.path.exists("Arial.ttf") else ImageFont.load_default()
    draw.text((x + 20, y + 20), from_name, fill=GMAIL_TEXT, font=font_sender)
    draw.text((x + 20 + len(from_name) * 8, y + 20), f" <{from_email}>", fill=GMAIL_LIGHT_TEXT, font=font_sender)
    
    # Subject
    font_subject = ImageFont.truetype("Arial Bold.ttf", 16) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default()
    draw.text((x + 20, y + 50), subject, fill=GMAIL_TEXT, font=font_subject)
    
    # Date
    draw.text((x + width - 120, y + 20), date, fill=GMAIL_LIGHT_TEXT, font=font_sender)
    
    # Attachment box
    att_x = x + 20
    att_y = y + 90
    att_width = 300
    att_height = 60
    
    rounded_rectangle(draw, (att_x, att_y, att_x + att_width, att_y + att_height), 4, 
                    fill=GMAIL_FOLDER, outline=GMAIL_BORDER)
    
    # Attachment icon (simplified)
    draw.rectangle((att_x + 15, att_y + 15, att_x + 35, att_y + 45), fill=GMAIL_BLUE)
    
    # Attachment name
    font_att = ImageFont.truetype("Arial.ttf", 13) if os.path.exists("Arial.ttf") else ImageFont.load_default()
    draw.text((att_x + 50, att_y + 20), attachment_name, fill=GMAIL_TEXT, font=font_att)
    draw.text((att_x + 50, att_y + 38), "137 KB", fill=GMAIL_LIGHT_TEXT, font=font_att)
    
    # Download button
    download_x = att_x + att_width - 40
    download_y = att_y + 15
    rounded_rectangle(draw, (download_x, download_y, download_x + 25, download_y + 25), 12, 
                    fill=GMAIL_HOVER, outline=None)
    # Simple download arrow
    draw.polygon([(download_x + 12, download_y + 8), (download_x + 18, download_y + 16), 
                 (download_x + 6, download_y + 16)], fill=GMAIL_BLUE)
    draw.rectangle((download_x + 10, download_y + 14, download_x + 14, download_y + 20), 
                  fill=GMAIL_BLUE)

# Function to create notification
def create_notification(draw, x, y, message, is_success=True):
    width = len(message) * 7 + 40
    height = 40
    color = (76, 175, 80) if is_success else (244, 67, 54)  # Green for success, Red for error
    
    rounded_rectangle(draw, (x, y, x + width, y + height), 4, fill=color)
    
    font = ImageFont.truetype("Arial.ttf", 14) if os.path.exists("Arial.ttf") else ImageFont.load_default()
    text_width = len(message) * 7
    text_x = x + (width - text_width) // 2
    draw.text((text_x, y + 12), message, fill=(255, 255, 255), font=font)

# Function to create a downloaded files view
def create_downloaded_files(draw, x, y, filenames):
    # Window container
    width = 600
    height = 50 + len(filenames) * 40
    
    rounded_rectangle(draw, (x, y, x + width, y + height), 8, fill=(250, 250, 250), outline=(200, 200, 200))
    
    # Header
    draw.rectangle((x, y, x + width, y + 40), fill=(240, 240, 240))
    font_header = ImageFont.truetype("Arial Bold.ttf", 14) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default()
    draw.text((x + 20, y + 12), "Downloads", fill=GMAIL_TEXT, font=font_header)
    
    # Files
    font_file = ImageFont.truetype("Arial.ttf", 13) if os.path.exists("Arial.ttf") else ImageFont.load_default()
    
    for i, filename in enumerate(filenames):
        file_y = y + 50 + i * 40
        icon_type = filename.split('.')[-1].lower()
        
        # File icon background
        icon_color = {
            'pdf': (244, 67, 54),  # Red for PDF
            'docx': (33, 150, 243),  # Blue for Word
            'jpg': (76, 175, 80),  # Green for images
            'xlsx': (0, 150, 136),   # Teal for Excel
            'pptx': (255, 152, 0)    # Orange for PowerPoint
        }.get(icon_type, (158, 158, 158))  # Grey for others
        
        draw.rectangle((x + 20, file_y + 5, x + 45, file_y + 30), fill=icon_color)
        draw.text((x + 27, file_y + 8), icon_type.upper()[:3], fill=(255, 255, 255), font=ImageFont.truetype("Arial Bold.ttf", 10) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default())
        
        # Filename
        draw.text((x + 60, file_y + 10), filename, fill=GMAIL_TEXT, font=font_file)

# Create screenshot 1: Before and after comparison
def create_screenshot1():
    # Create a 1280x800 image
    img = Image.new('RGB', (1280, 800), color=GMAIL_BG)
    draw = ImageDraw.Draw(img)
    
    # Draw a Gmail-like header
    draw.rectangle((0, 0, 1280, 60), fill=GMAIL_HEADER)
    
    # Gmail logo (simplified)
    draw.text((30, 20), "Gmail", fill=GMAIL_RED, font=ImageFont.truetype("Arial Bold.ttf", 20) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default())
    
    # Title
    font_title = ImageFont.truetype("Arial Bold.ttf", 24) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default()
    draw.text((400, 100), "Before AttachFlow", fill=GMAIL_TEXT, font=font_title)
    draw.text((900, 100), "After AttachFlow", fill=GMAIL_TEXT, font=font_title)
    
    # Before: Create a Gmail email with attachment
    create_gmail_email(draw, 150, 150, 500, 180, "John Smith", "john.smith@company.com", 
                    "Project Report for Review", "Report_v2.pdf", "Mar 23")
    
    # Downloads before
    create_downloaded_files(draw, 150, 380, [
        "attachment.pdf",
        "document.pdf",
        "attachment_16273.pdf"
    ])
    
    # After: Create a Gmail email with attachment
    create_gmail_email(draw, 700, 150, 500, 180, "John Smith", "john.smith@company.com", 
                    "Project Report for Review", "Report_v2.pdf", "Mar 23")
    
    # Success notification
    create_notification(draw, 780, 260, "Download complete: Report_v2.pdf")
    
    # Downloads after
    create_downloaded_files(draw, 700, 380, [
        "2023-03-23_john.smith@company.com_Report_v2.pdf",
        "2023-03-22_mary.jones@client.org_Contract_Agreement.pdf",
        "2023-03-20_team@department.com_Budget_2023.xlsx"
    ])
    
    # Save the image
    img.save('screenshots/comparison.png')
    print("Created screenshot 1: comparison.png")

# Create screenshot 2: Download process
def create_screenshot2():
    # Create a 1280x800 image
    img = Image.new('RGB', (1280, 800), color=GMAIL_BG)
    draw = ImageDraw.Draw(img)
    
    # Draw a Gmail-like header
    draw.rectangle((0, 0, 1280, 60), fill=GMAIL_HEADER)
    
    # Gmail logo (simplified)
    draw.text((30, 20), "Gmail", fill=GMAIL_RED, font=ImageFont.truetype("Arial Bold.ttf", 20) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default())
    
    # Create multiple Gmail emails with attachments to show different cases
    create_gmail_email(draw, 150, 100, 800, 180, "Sarah Johnson", "sarah.j@example.com", 
                    "Q1 Financial Report", "Q1_Financials.xlsx", "Mar 15")
    
    create_gmail_email(draw, 150, 320, 800, 180, "Dev Team", "developers@tech.com", 
                    "New Product Documentation", "User_Manual_v1.docx", "Mar 18")
    
    create_gmail_email(draw, 150, 540, 800, 180, "Marketing Dept", "marketing@company.com", 
                    "Campaign Assets for Review", "Campaign_Image.jpg", "Mar 20")
    
    # Success notifications
    create_notification(draw, 590, 200, "Download complete: 2023-03-15_sarah.j@example.com_Q1_Financials.xlsx")
    create_notification(draw, 600, 420, "Download complete: 2023-03-18_developers@tech.com_User_Manual_v1.docx")
    
    # Save the image
    img.save('screenshots/multiple_downloads.png')
    print("Created screenshot 2: multiple_downloads.png")

# Create screenshot 3: Settings/options
def create_screenshot3():
    # Create a 1280x800 image 
    img = Image.new('RGB', (1280, 800), color=GMAIL_BG)
    draw = ImageDraw.Draw(img)
    
    # Title
    font_title = ImageFont.truetype("Arial Bold.ttf", 26) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default()
    draw.text((400, 80), "AttachFlow Options", fill=GMAIL_TEXT, font=font_title)
    
    # Options panel
    panel_x = 300
    panel_y = 150
    panel_width = 680
    panel_height = 500
    rounded_rectangle(draw, (panel_x, panel_y, panel_x + panel_width, panel_y + panel_height), 
                    8, fill=(250, 250, 250), outline=GMAIL_BORDER)
    
    # Options header
    draw.rectangle((panel_x, panel_y, panel_x + panel_width, panel_y + 60), fill=GMAIL_BLUE)
    font_header = ImageFont.truetype("Arial Bold.ttf", 18) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default()
    draw.text((panel_x + 30, panel_y + 18), "Filename Pattern Settings", fill=(255, 255, 255), font=font_header)
    
    # Pattern option
    font_option = ImageFont.truetype("Arial.ttf", 16) if os.path.exists("Arial.ttf") else ImageFont.load_default()
    draw.text((panel_x + 30, panel_y + 100), "Filename Pattern:", fill=GMAIL_TEXT, font=font_option)
    
    # Pattern textbox
    textbox_y = panel_y + 130
    rounded_rectangle(draw, (panel_x + 30, textbox_y, panel_x + panel_width - 30, textbox_y + 50), 
                    4, fill=GMAIL_BG, outline=GMAIL_BORDER)
    draw.text((panel_x + 40, textbox_y + 15), "YYYY-MM-DD_SenderName_OriginalFilename", 
             fill=GMAIL_TEXT, font=font_option)
    
    # Available variables
    draw.text((panel_x + 30, panel_y + 200), "Available Variables:", fill=GMAIL_TEXT, font=font_option)
    
    font_vars = ImageFont.truetype("Arial.ttf", 14) if os.path.exists("Arial.ttf") else ImageFont.load_default()
    variables = [
        "YYYY-MM-DD - Date of the email",
        "SenderName - Email address of the sender",
        "OriginalFilename - Original attachment filename",
        "Subject - Subject of the email (truncated)"
    ]
    
    for i, var in enumerate(variables):
        draw.text((panel_x + 50, panel_y + 240 + i * 30), "• " + var, fill=GMAIL_LIGHT_TEXT, font=font_vars)
    
    # Preview section
    draw.text((panel_x + 30, panel_y + 370), "Example Preview:", fill=GMAIL_TEXT, font=font_option)
    
    # Example preview box
    preview_y = panel_y + 400
    rounded_rectangle(draw, (panel_x + 30, preview_y, panel_x + panel_width - 30, preview_y + 50), 
                    4, fill=GMAIL_FOLDER, outline=GMAIL_BORDER)
    draw.text((panel_x + 40, preview_y + 15), "2023-03-23_john.smith@example.com_Project_Report.pdf", 
             fill=GMAIL_TEXT, font=font_vars)
    
    # Save button
    button_y = panel_y + 480 - 50
    rounded_rectangle(draw, (panel_x + panel_width - 150, button_y, panel_x + panel_width - 30, button_y + 40), 
                    4, fill=GMAIL_BLUE, outline=None)
    draw.text((panel_x + panel_width - 110, button_y + 10), "Save", 
             fill=(255, 255, 255), font=font_option)
    
    # Save the image
    img.save('screenshots/options.png')
    print("Created screenshot 3: options.png")

# Create screenshot 4: PDF Preview download
def create_screenshot4():
    # Create a 1280x800 image
    img = Image.new('RGB', (1280, 800), color=GMAIL_BG)
    draw = ImageDraw.Draw(img)
    
    # Draw a Gmail-like header
    draw.rectangle((0, 0, 1280, 60), fill=GMAIL_HEADER)
    
    # Gmail logo (simplified)
    draw.text((30, 20), "Gmail", fill=GMAIL_RED, font=ImageFont.truetype("Arial Bold.ttf", 20) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default())
    
    # Create a PDF preview dialog
    dialog_x = 280
    dialog_y = 100
    dialog_width = 720
    dialog_height = 580
    
    # Dark overlay background
    draw.rectangle((0, 0, 1280, 800), fill=(0, 0, 0, 128))
    
    # PDF Viewer dialog
    rounded_rectangle(draw, (dialog_x, dialog_y, dialog_x + dialog_width, dialog_y + dialog_height), 
                    8, fill=GMAIL_BG, outline=GMAIL_BORDER)
    
    # PDF Header
    draw.rectangle((dialog_x, dialog_y, dialog_x + dialog_width, dialog_y + 50), fill=GMAIL_HEADER)
    font_pdf_header = ImageFont.truetype("Arial Bold.ttf", 16) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default()
    draw.text((dialog_x + 20, dialog_y + 15), "Contract_Agreement.pdf", fill=GMAIL_TEXT, font=font_pdf_header)
    
    # PDF Toolbar
    draw.rectangle((dialog_x, dialog_y + 50, dialog_x + dialog_width, dialog_y + 90), fill=(250, 250, 250))
    
    # Toolbar buttons (simplified)
    toolbar_buttons = ["Print", "Download", "Share", "Zoom"]
    button_width = 80
    
    for i, button in enumerate(toolbar_buttons):
        button_x = dialog_x + 10 + i * (button_width + 10)
        button_y = dialog_y + 60
        
        # Highlight download button
        button_color = GMAIL_BLUE if button == "Download" else (230, 230, 230)
        text_color = (255, 255, 255) if button == "Download" else GMAIL_TEXT
        
        rounded_rectangle(draw, (button_x, button_y, button_x + button_width, button_y + 25), 
                        4, fill=button_color, outline=None)
        
        font_button = ImageFont.truetype("Arial.ttf", 14) if os.path.exists("Arial.ttf") else ImageFont.load_default()
        text_width = len(button) * 7
        draw.text((button_x + (button_width - text_width) // 2, button_y + 4), button, fill=text_color, font=font_button)
        
        # Add a highlight or attention marker to the download button
        if button == "Download":
            # Draw an arrow pointing to the button
            arrow_x = button_x + button_width + 10
            arrow_y = button_y + 12
            
            draw.polygon([(arrow_x, arrow_y), (arrow_x + 15, arrow_y - 10), (arrow_x + 15, arrow_y + 10)], 
                        fill=(255, 152, 0))  # Orange arrow
    
    # PDF Content (simplified illustration)
    pdf_content_x = dialog_x + 20
    pdf_content_y = dialog_y + 100
    pdf_content_width = dialog_width - 40
    pdf_content_height = dialog_height - 150
    
    # PDF document background
    draw.rectangle((pdf_content_x, pdf_content_y, pdf_content_x + pdf_content_width, pdf_content_y + pdf_content_height), 
                 fill=(255, 255, 255))
    
    # Add simple contract-like content (lines of text)
    font_pdf = ImageFont.truetype("Arial.ttf", 12) if os.path.exists("Arial.ttf") else ImageFont.load_default()
    font_pdf_title = ImageFont.truetype("Arial Bold.ttf", 18) if os.path.exists("Arial Bold.ttf") else ImageFont.load_default()
    
    # Contract title
    draw.text((pdf_content_x + 150, pdf_content_y + 40), "SERVICE AGREEMENT CONTRACT", fill=(0, 0, 0), font=font_pdf_title)
    
    # Contract sections
    text_lines = [
        "This Agreement is entered into as of the date of signature below, by and between:",
        "",
        "COMPANY XYZ, INC., a corporation with offices at 123 Business St., City, State",
        "                                             AND",
        "CLIENT ABC, LLC, a limited liability company at 456 Client Ave., City, State",
        "",
        "1. SERVICES",
        "",
        "1.1 The Company shall provide Client with the following services (the \"Services\"):",
        "• Software Development",
        "• Technical Support",
        "• System Maintenance",
        "",
        "2. TERM",
        "",
        "2.1 This Agreement shall commence on March 15, 2023 and continue for a period",
        "of twelve (12) months unless earlier terminated as provided herein."
    ]
    
    line_height = 18
    for i, line in enumerate(text_lines):
        draw.text((pdf_content_x + 30, pdf_content_y + 90 + i * line_height), line, fill=(0, 0, 0), font=font_pdf)
    
    # Notification showing the download and renamed file
    create_notification(draw, dialog_x + 150, dialog_y + dialog_height + 20, 
                      "Download complete: 2023-03-22_mary.jones@client.org_Contract_Agreement.pdf")
    
    # Add download info text
    font_info = ImageFont.truetype("Arial.ttf", 16) if os.path.exists("Arial.ttf") else ImageFont.load_default()
    info_text = "AttachFlow successfully detects and renames PDF downloads from the preview viewer!"
    draw.text((dialog_x + 100, dialog_y + dialog_height + 80), info_text, fill=GMAIL_TEXT, font=font_info)
    
    # Save the image
    img.save('screenshots/pdf_preview.png')
    print("Created screenshot 4: pdf_preview.png")

# Run the functions to create all screenshots
if __name__ == "__main__":
    create_screenshot1()
    create_screenshot2()
    create_screenshot3()
    create_screenshot4()
    print("All screenshots created in the 'screenshots' directory.")
