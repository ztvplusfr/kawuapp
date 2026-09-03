import plistlib
import base64

with open("distribution/disclaimer.txt", "rb") as f:
    raw_disclaimer = f.read()

# Encode in base64
disclaimer_b64 = base64.b64encode(raw_disclaimer).decode("ascii")

# Plist resource format compatible with macOS udifrez
plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>LPic</key>
	<array>
		<dict>
			<key>Attributes</key>
			<string>0x0000</string>
			<key>Data</key>
			<data>
			AAAAAgAAAAAAAAAAAAQAAA==
			</data>
			<key>ID</key>
			<string>5000</string>
			<key>Name</key>
			<string></string>
		</dict>
	</array>
	<key>STR#</key>
	<array>
		<dict>
			<key>Attributes</key>
			<string>0x0000</string>
			<key>Data</key>
			<data>
			AAYNRW5nbGlzaCB0ZXN0MQVBZ3JlZQhEaXNhZ3JlZQVQcmludAdT
			YXZlLi4ueklmIHlvdSBhZ3JlZSB3aXRoIHRoZSB0ZXJtcyBvZiB0
			aGlzIGxpY2Vuc2UsIGNsaWNrICJBZ3JlZSIgdG8gYWNjZXNzIHRo
			ZSBzb2Z0d2FyZS4gSWYgeW91IGRvIG5vdCBhZ3JlZSwgY2xpY2sg
			IkRpc2FncmVlIi4=
			</data>
			<key>ID</key>
			<string>5000</string>
			<key>Name</key>
			<string>English buttons</string>
		</dict>
	</array>
	<key>TEXT</key>
	<array>
		<dict>
			<key>Attributes</key>
			<string>0x0000</string>
			<key>Data</key>
			<data>
{disclaimer_b64}
			</data>
			<key>ID</key>
			<string>5000</string>
			<key>Name</key>
			<string>English</string>
		</dict>
	</array>
</dict>
</plist>
"""

with open("distribution/sla.plist", "w", encoding="utf-8") as out:
    out.write(plist_content)

print("distribution/sla.plist successfully generated")
