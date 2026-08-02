import json
import re

try:
    with open(r'C:\Users\Emirr\AppData\Local\Temp\okey_transcript.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Check if the text is in data['content'] or data['output']
    # transcript.jsonl entries for TOOL_RESPONSE have content in content or 	ool_calls
    text = ""
    if "content" in data and "The following code has been modified" in data["content"]:
        text = data["content"]
    elif "content" in data and isinstance(data["content"], list):
        for item in data["content"]:
            if isinstance(item, dict) and "text" in item and "The following code has been modified" in item["text"]:
                text = item["text"]
                break
    
    # If the transcript format has the view_file output in a tool response field
    if not text:
        text = str(data)

    # Extract lines after the warning message
    lines = text.split('\n')
    start_idx = 0
    for i, line in enumerate(lines):
        if "The following code has been modified to include a line number before every line" in line:
            start_idx = i + 1
            break
            
    # The last two lines are usually "The above content shows the entire, complete file contents..."
    end_idx = len(lines)
    for i in range(len(lines)-1, -1, -1):
        if "The above content shows the entire, complete file contents" in lines[i]:
            end_idx = i
            break
            
    css_lines = lines[start_idx:end_idx]
    
    # Strip the line numbers "123: "
    cleaned_css = []
    for line in css_lines:
        match = re.match(r'^\d+:\s?(.*)', line)
        if match:
            cleaned_css.append(match.group(1))
        else:
            # If a line doesn't have a number, just keep it (e.g. wrapped lines or empty)
            cleaned_css.append(line)
            
    with open(r'public\css\okey101.css', 'w', encoding='utf-8') as out:
        out.write('\n'.join(cleaned_css))
        
    print(f"Successfully recovered {len(cleaned_css)} lines of CSS!")

except Exception as e:
    print(f"Error: {e}")
