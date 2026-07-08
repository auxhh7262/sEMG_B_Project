import pptx
prs = pptx.Presentation(r'E:\sEMG_B_Project\docs\deck_workspace\sEMG肌肉疲劳监测_操作指南_new.pptx')
print(f'Slides: {len(prs.slides)}')
print(f'Size: {prs.slide_width/914400:.2f}" x {prs.slide_height/914400:.2f}"')
