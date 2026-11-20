Windows 使用说明

1. 首次使用：右键 Setup-LocalDomains.cmd，选择“以管理员身份运行”。它会备份 hosts，并配置以下本地域名：
   127.0.0.1 api.getfiddler.be
   127.0.0.1 identity.getfiddler.be
2. 正常双击 Fiddler Everywhere.exe 启动，不需要以管理员身份运行。
3. 汉化版可按 Ctrl+T 切换简体中文或 English。切换英文会完全停止翻译监听；英文版不加载汉化脚本。
   汉化只处理界面文字，抓包正文、代码编辑器和请求数据表格保持原始内容。
4. CONNECT 隧道记录会显示锁图标。查看 HTTPS 明文请求时，可按请求方法筛除 CONNECT。
   系统代理模式的 HTTPS 解密需要在 Settings > HTTPS 中信任本机生成的 Fiddler CA 并开启 Capture HTTPS traffic。
   独立浏览器捕获模式通常会自行配置证书信任。

补丁来源：
https://github.com/msojocs/fiddler-everywhere-enhance/tree/fde77897f0c24485c38c98d0789dcba59f79d604
https://github.com/project-yui/Yui-patch/releases/tag/v1.1.3
https://github.com/msojocs/dotnet-runtime-for-fildder/releases/tag/v10.0.9-1
