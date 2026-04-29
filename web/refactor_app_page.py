import os

FILE_PATH = "c:/Users/ADMIN/Desktop/bb project/task-management1-maste-main/task-management1-maste-main/web/src/app/app/page.tsx"

with open(FILE_PATH, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Imports
if "import { AppLayout" not in code:
    code = code.replace(
        'import { ConfessionChat } from "@/components/confessions/ConfessionChat";',
        'import { ConfessionChat } from "@/components/confessions/ConfessionChat";\nimport { AppLayout, SidebarItem } from "@/components/AppLayout";\nimport { AdminWorkPackages } from "@/components/AdminWorkPackages";'
    )

# 2. Modify container shell
shell_start_search = '      <div className="min-h-screen px-4 py-10">'
shell_end_search = '            <div>'

if shell_start_search in code and shell_end_search in code:
    shell_start_idx = code.find(shell_start_search)
    shell_end_idx = code.find(shell_end_search) + len(shell_end_search)
    
    # We replace from min-h-screen start to the <div> before adminTab dashboard.
    new_shell = """      <AppLayout
        sidebarTitle={isAdmin ? "ADMINISTRATION" : "USER PROFILE"}
        sidebarItems={[
          { id: "dashboard", icon: "📊", label: "Dashboard" },
          { id: "assign", icon: "➕", label: "Assign Task" },
          { id: "tasks", icon: "📦", label: "Work Packages" },
          { id: "users", icon: "👥", label: "Accounts" },
          { id: "analytics", icon: "📈", label: "Analytics" },
          { id: "settings", icon: "⚙️", label: "Settings" },
          { id: "div1", icon: <span />, label: "", isDivider: true },
          { id: "recently_created", icon: "⏰", label: "Recently Created" },
          { id: "latest_activity", icon: "⚡", label: "Latest Activity" },
          { id: "overdue", icon: "⚠️", label: "Overdue" },
          { id: "shared_with_users", icon: "🤝", label: "Shared with Users" },
          { id: "shared_with_me", icon: "📥", label: "Shared with Me" },
          { id: "div2", icon: <span />, label: "", isDivider: true },
          { id: "notifications", icon: "🔔", label: "Notifications", unreadCount: activityUnread },
          { id: "bulletin", icon: "📋", label: "Bulletin Board" },
          { id: "confessions", icon: "💬", label: "Confession Chat" }
        ]}
        activeTab={adminTab === "tasks" ? taskFilter : adminTab}
        onTabChange={(id) => {
           if (["recently_created", "latest_activity", "overdue", "shared_with_users", "shared_with_me"].includes(id)) {
              setTaskFilter(id as any);
              setAdminTab("tasks");
           } else {
              setAdminTab(id as any);
           }
        }}
      >
        <div className="p-4 md:p-6 lg:p-8 h-full overflow-y-auto">
          <div className="max-w-6xl mx-auto w-full">"""
    code = code[:shell_start_idx] + new_shell + code[shell_end_idx:]


# 3. Replace the tasks rendering block
# The block starts at `              {isAdmin && adminTab === "tasks" ? (`
# and ends right before `              {isAdmin && adminTab === "users" ? (`
tasks_start_search = '              {isAdmin && adminTab === "tasks" ? ('
users_start_search = '              {isAdmin && adminTab === "users" ? ('

if tasks_start_search in code and users_start_search in code:
    tasks_start_idx = code.find(tasks_start_search)
    users_start_idx = code.find(users_start_search)
    
    new_tasks_block = """              {isAdmin && adminTab === "tasks" ? (
                <div className="fixed inset-0 top-14 left-0 lg:left-[240px] z-50 bg-[#101014]">
                   <AdminWorkPackages tasks={tasks} allUsers={allUserRecords} filterType={taskFilter} setFilterType={setTaskFilter as any} />
                </div>
              ) : null}

"""
    code = code[:tasks_start_idx] + new_tasks_block + code[users_start_idx:]

# 4. Modify App Layout closing tags
# The old code closes with </div></div></div></RequireAuth>);
close_search = """          </div>

        </div>
      </div>
    </RequireAuth>"""
if close_search in code:
    new_close = """          </div>
        </div>
      </AppLayout>
    </RequireAuth>"""
    code = code.replace(close_search, new_close)

with open(FILE_PATH, "w", encoding="utf-8") as f:
    f.write(code)

print("Refactored safely!")
