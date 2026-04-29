import os

FILE_PATH = "c:/Users/ADMIN/Desktop/bb project/task-management1-maste-main/task-management1-maste-main/web/src/app/profile/page.tsx"

with open(FILE_PATH, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Imports
if "import { AppLayout" not in code:
    code = code.replace(
        'import { ConfessionChat } from "@/components/confessions/ConfessionChat";',
        'import { ConfessionChat } from "@/components/confessions/ConfessionChat";\nimport { AppLayout } from "@/components/AppLayout";'
    )

# 2. Replace shell
shell_start_search = '        <div className="min-h-screen px-4 py-10">'
shell_end_search = '          <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">'

if shell_start_search in code and shell_end_search in code:
    start_idx = code.find(shell_start_search)
    end_idx = code.find(shell_end_search) + len(shell_end_search)
    
    new_shell = """      <AppLayout
        sidebarTitle="USER PROFILE"
        sidebarItems={[
          { id: "dashboard", icon: "📊", label: "Dashboard" },
          { id: "profile", icon: "👤", label: "My Profile" },
          { id: "my_tasks", icon: "📋", label: "My Tasks" },
          { id: "settings", icon: "⚙️", label: "Settings" },
          { id: "div1", icon: <span />, label: "", isDivider: true },
          { id: "bulletin", icon: "📋", label: "Bulletin Board" },
          { id: "confessions", icon: "💬", label: "Confession Chat" }
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as any)}
      >
        <div className="p-4 md:p-6 lg:p-8 h-full overflow-y-auto">
          <div className="max-w-6xl mx-auto w-full">"""
    
    code = code[:start_idx] + new_shell + code[end_idx:]

# 3. Handle closing tags
close_search = """            {sidebar}
            <div>{main}</div>
          </div>
        </div>
      </div>"""

if close_search in code:
    new_close = """            <div>{main}</div>
          </div>
        </div>
      </AppLayout>"""
    code = code.replace(close_search, new_close)

with open(FILE_PATH, "w", encoding="utf-8") as f:
    f.write(code)

print("Profile refactored successfully!")
