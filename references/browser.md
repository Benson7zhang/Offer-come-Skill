# BOSS 浏览器运行手册

## 首次使用：用户准备与助手检查

仅在首次使用、未登录或连接失效时引导以下步骤。先检查已有状态，完成的步骤不要重复要求。

1. 用户在Chrome打开 https://www.zhipin.com/ ，自行完成登录、扫码或验证码，确认使用求职者身份。助手不索取密码、验证码或Cookie。
2. 提醒用户检查在线简历、毕业年份和求职信息是否真实准确；这些资料可能随沟通向招聘方展示。助手不会因开场白“不提学历”而修改在线简历。
3. 用户提供本地简历路径或真实经历文本即可开始匹配。筛选和发送开场白无需先上传附件；简历附件始终由求职者本人上传和发送。
4. 当前长连接方案下，请用户打开 chrome://inspect/#remote-debugging ，若页面支持，开启“Allow remote debugging”，等待“Server running at”并提供实际地址。没有该入口或无法启动时，先核实Chrome版本和环境，明确阻碍，不假称已连接，也不要求反复开关。
5. 助手检查Node与DevToolsActivePort后启动或复用连接。浏览器弹出允许远程调试连接提示时由用户点击允许；该权限可让连接工具读取、操作浏览器，只连接可信的本地工具。不要自动点击或绕过授权。
6. 做一次只读验证：列出页面并读取BOSS页面的URL、标题或岗位内容，确认登录态与连接可用。仅脚本启动成功不代表可操作。
7. 告诉用户保持浏览器打开；可以使用其他标签，但尽量不切换助手正在操作的岗位/聊天。用户需接手时可说“暂停”。每次发送仍要重新核对目标，不把用户未操作当作稳定性保证。

BOSS搜索条件由助手依据配置操作，不要求用户手动预选全部筛选项。首次实际发起沟通前，说明“立即沟通”可能自动发送账号默认招呼，建议用户检查其内容是否合适；不要为检查招呼而向真实招聘者试发，也不擅改全局招呼。只筛选/起草模式不点击沟通。

当前脚本默认路径适配Windows＋Chrome，运行环境需支持Node全局WebSocket。仅支持当前Windows＋Chrome工作流；不同Chrome配置目录需核实实际DevToolsActivePort路径；用户无需手写连接命令，助手负责可执行的连接准备。

## 已验证的现场经验

2026-10-22 的 Chrome/BOSS 会话中，启用控制台采集的连接触发站点 history.back()，页面回退到 about:blank。长期保持原始 CDP WebSocket，临时附加目标并直接 Runtime.evaluate、完成后 detach，未启用 Runtime/Console/Debugger/Network 域，已完成多批真实读取与发送核验。这是现场经验，不保证所有版本均稳定；不要通过屏蔽站点脚本、覆盖history或伪造浏览器状态掩盖问题。

优先复用会话内已经存在的连接和 exec session ID。ID只在当前会话有效，不写死历史ID。断线时说明原因，先检查9222与DevToolsActivePort，不重复拉起多个控制器。

## 启动脚本

scripts/boss-connection.cjs 依赖 Node 22+ 的全局 WebSocket。运行：

    node <skill目录>/scripts/boss-connection.cjs --port-file <Chrome用户数据目录>/DevToolsActivePort

不传路径则读取 Windows LOCALAPPDATA 下 Google/Chrome/User Data/DevToolsActivePort。不同Chrome配置目录需传入实际路径。通过 exec_command 的 tty 会话启动，保存返回的 session_id；通过 write_stdin发送一行JSON命令。Chrome的“允许远程调试”由用户点击，无法且不应自动替代。不要读取cookies、密码或与求职无关的数据。

命令协议：

    {"requestId":"list-1","action":"list"}
    {"requestId":"open-1","action":"open","url":"https://www.zhipin.com/web/geek/jobs?city=101280600&query=AI%20实习"}
    {"requestId":"read-1","action":"eval","targetId":"实际目标ID","file":"work/read-jd.js"}

脚本仅执行顺序队列，每次30秒超时；eval读取本地JS文件，执行后detach；保持浏览器WebSocket。返回error必须检查。新开页面等加载完成再读。所有发送步骤顺序执行；不要在一个点击未完成对话加载时立即连点多个招聘者。

已验证城市码：广州101280100、深圳101280600、杭州101210100、南京101190100、成都101270100。其他城市从网站UI核实，不猜测。

## 页面读取与发送

只读脚本返回 location.href、document.body.innerText、可见按钮文字即可。不要仅截取很短的文本造成JD任职要求缺失；定位“职位描述”至招聘者/安全提示部分，并检查是否完整。避免返回无关聊天历史。

当前已观察的选择器（页面变化时必须重新检查）：

- 发起沟通：可见 a.btn-startchat，文字必须严格为“立即沟通”。“继续沟通”是已有联系，应跳过。
- 弹窗输入：textarea.input-area。
- 发送：.send-message，disable类表示不可发送。
- 使用HTMLTextAreaElement原型的原生value setter填入文字并派发冒泡input事件，回读value核对；发送前再次核实URL与招聘者。

首次点击通常自动发送默认招呼。定制消息是追加消息；如需只发一条，先查清账号/页面配置，与用户说明后再调整，不能承诺点击不会发送默认消息。

点击成功只能表示事件触发。读取对话中完整消息及“已发送/送达”、输入框空值，才记成功。无输入框时先读取当前页面，核实是否已跳转、尚在加载或出现错误；不要盲目重试发送。最后仍不确定则记录unknown并告知用户。

可用会话已经连接时，可通过相同eval协议读取一段只读脚本作为烟雾验证；不应为测试skill再次发送真实招聘消息。
