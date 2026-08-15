// 项目代码参考 - 从 FirstDemo-WPFwithHalcon 和 WPFwithVisionPro 提取
// 仓库: https://github.com/grapefruit3c/FirstDemo-WPFwithHalcon
//       https://github.com/grapefruit3c/WPFwithVisionPro

var PROJECT_REFS = {
  "n05": [
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/core/HalconProcessor.cs",
      lines: "L30, L69-76, L83-92",
      code: `// 加载形状模板模型
HOperatorSet.ReadShapeModel(templateImagePath, out _modelID);

// 设置匹配参数
HOperatorSet.SetGenericShapeModelParam(_modelID, "min_score", cfg.MinScore);
HOperatorSet.SetGenericShapeModelParam(_modelID, "num_matches", cfg.NumMatches);

// 执行匹配
HOperatorSet.FindGenericShapeModel(ho_Image, _modelID, out hv_MatchResultID, out hv_NumMatchResult);

// 提取结果：行、列、分数
HOperatorSet.GetGenericShapeModelResult(hv_MatchResultID, 0, "row", out hv_Row);
HOperatorSet.GetGenericShapeModelResult(hv_MatchResultID, 0, "column", out hv_Column);
HOperatorSet.GetGenericShapeModelResult(hv_MatchResultID, 0, "score", out hv_Score);`,
      explain: "这段代码展示了 Halcon 形状模板匹配的完整流程：ReadShapeModel 加载预训练的 .shm 模板文件，SetGenericShapeModelParam 配置匹配灵敏度（min_score=0.65 表示最低匹配分数），FindGenericShapeModel 执行实际匹配并返回结果 ID，最后用 GetGenericShapeModelResult 提取匹配位置的行、列坐标和匹配置信度分数。项目中用这个流程定位空滤器上的条码区域。"
    },
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/core/HikCameraManager.cs",
      lines: "L89-104",
      code: `// 从海康相机原始数据创建 Halcon 图像（关键桥接）
byte[] imageBuffer = new byte[bufSize];
Marshal.Copy(stFrameOut.pBufAddr, imageBuffer, 0, bufSize);

GCHandle handle = GCHandle.Alloc(imageBuffer, GCHandleType.Pinned);
try {
    HOperatorSet.GenImage1(out HObject hobj, "byte", width, height, handle.AddrOfPinnedObject());
    image = new HImage(hobj);
    hobj.Dispose();
} finally {
    handle.Free();
}`,
      explain: "GenImage1 是海康相机 SDK 与 Halcon 之间的关键桥梁——从相机的原始字节数组创建 HImage。GCHandle.Alloc 钉住(pinning)字节数组防止 GC 移动内存，这样 Halcon 才能安全地复制像素数据。v2.0 版本的关键修复：原来用的 GenImage1Extern 只引用指针不拷贝数据，导致 MV_CC_FreeImageBuffer_NET 释放后出现 use-after-free。改为 GenImage1 后数据被深拷贝，可以安全释放相机缓冲区。"
    }
  ],

  "n06": [
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/core/HalconProcessor.cs",
      lines: "L30, L69-92",
      code: `// 1. 初始化时加载模板（只加载一次）
HOperatorSet.ReadShapeModel(templateImagePath, out _modelID);

// 2. 每帧检测时执行匹配
HOperatorSet.SetGenericShapeModelParam(_modelID, "min_score", cfg.MinScore);  // 0.65
HOperatorSet.SetGenericShapeModelParam(_modelID, "num_matches", cfg.NumMatches);  // 1
HOperatorSet.SetGenericShapeModelParam(_modelID, "border_shape_models", "false");

HOperatorSet.FindGenericShapeModel(ho_Image, _modelID, out hv_MatchResultID, out hv_NumMatchResult);

// 3. 获取匹配位置
HOperatorSet.GetGenericShapeModelResult(hv_MatchResultID, 0, "row", out hv_Row);
HOperatorSet.GetGenericShapeModelResult(hv_MatchResultID, 0, "column", out hv_Column);
HOperatorSet.GetGenericShapeModelResult(hv_MatchResultID, 0, "score", out hv_Score);

// 4. 根据匹配位置定义 ROI 进行条码识别
ho_ROI = HObjectExtensions.GenRectangle1(
    centerRow - offset, centerCol - offset,
    centerRow + offset, centerCol + offset);
ho_ReducedImage = ho_Image.ReduceDomain(ho_ROI);
HOperatorSet.FindBarCode(ho_ReducedImage, out ho_SymbolRegions, _barCodeHandle, cfg.BarcodeType, out hv_DecodedDataStrings);`,
      explain: "项目使用 Halcon 23.05 的 Generic Shape Model API（新版接口）。关键设计：模板在 InitModel() 中只加载一次，后续每帧复用 _modelID，避免重复 IO。匹配后根据匹配位置动态生成 ROI（矩形区域），用 ReduceDomain 裁剪后送入条码识别。这是一个典型的'先定位再识别'的两级处理策略——先用模板匹配找到大致位置，再用条码识别精确解码。"
    }
  ],

  "n07": [
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/core/HalconProcessor_Cam2.cs",
      lines: "L55-96",
      code: `// Blob 分析完整 Pipeline：ROI → Threshold → Connection → SelectShape → AreaCenter

// 1. 定义 ROI（圆形和旋转矩形）
ho_ROI_SteelRing1 = HObjectExtensions.GenCircle(931.354, 1320.23, 324.103);
ho_ROI_SteelRing2 = HObjectExtensions.GenCircle(1027.24, 1315.18, 312.868);
ho_SteelRingCombined = ho_ROI_SteelRing1.ConcatObj(ho_ROI_SteelRing2);
ho_SteelRingReduced = ho_Image.ReduceDomain(ho_SteelRingCombined);

// 2. 阈值分割
ho_SteelRingThresh = ho_SteelRingReduced.Threshold(cfg.Cam2ThresholdMin, cfg.Cam2ThresholdMax);  // 70-130

// 3. 连通域分析
ho_SteelRingConnected = ho_SteelRingThresh.Connection();

// 4. 按面积筛选
ho_SteelRingSelected = ho_SteelRingConnected.SelectShape("area", "and", 100, 99999);

// 5. 获取最大 Blob 的面积
ho_SteelRingSelected.AreaCenter(out hv_Areas1, out hv_Rows1, out hv_Columns1);
HOperatorSet.TupleMax(hv_Areas1, out maxArea1);

// 6. 判定 OK/NG
steelRingResult = (maxArea1 > cfg.Cam2SteelRingAreaThreshold) ? "OK" : "NG";  // 阈值 20000`,
      explain: "这是工业视觉中最经典的 Blob 分析 Pipeline，用于检测钢圈和滤芯是否存在。项目用扩展方法（HObjectExtensions）封装了 HOperatorSet 调用，使代码可以链式调用：image.ReduceDomain(roi).Threshold(70, 130).Connection().SelectShape('area', 'and', 100, 99999)。关键参数：阈值范围 [70,130] 是灰度值范围，面积阈值 20000 像素用于区分有/无钢圈。TupleMax 取最大 Blob 面积做判定，避免多个小噪点被误判为有料。"
    }
  ],

  "n08": [
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/core/HalconProcessor.cs",
      lines: "L33-39, L101-104",
      code: `// 1. 初始化时创建条码模型（只创建一次，复用）
HOperatorSet.CreateBarCodeModel(new HTuple(), new HTuple(), out _barCodeHandle);
HOperatorSet.SetBarCodeParam(_barCodeHandle, "element_size_min", cfg.BarcodeElementSizeMin);  // 1
HOperatorSet.SetBarCodeParam(_barCodeHandle, "element_size_max", cfg.BarcodeElementSizeMax);  // 30
HOperatorSet.SetBarCodeParam(_barCodeHandle, "orientation", cfg.BarcodeOrientation);  // 45
HOperatorSet.SetBarCodeParam(_barCodeHandle, "stop_after_result_num", 1);  // 找到1个就停

// 2. 每帧执行条码识别
HTuple hv_DecodedDataStrings;
HOperatorSet.FindBarCode(ho_ReducedImage, out ho_SymbolRegions,
    _barCodeHandle, cfg.BarcodeType, out hv_DecodedDataStrings);  // BarcodeType = "Code 128"

// 3. 提取条码字符串
barcodeText = hv_DecodedDataStrings.S.ToString();`,
      explain: "项目识别 Code 128 类型条码。关键性能优化：CreateBarCodeModel 在 InitModel() 中只调用一次，_barCodeHandle 被所有后续 FindBarCode 调用复用，避免每帧创建/销毁模型的开销。stop_after_result_num=1 表示找到第一个条码就停止搜索。orientation=45 允许条码有 ±45 度倾斜。FindBarCode 在 ReduceDomain 裁剪后的小区域上执行，而不是全图搜索，大幅提升速度。"
    }
  ],

  "n09": [
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/core/HikCameraManager.cs",
      lines: "L31-53, L72-119",
      code: `// 1. 枚举设备（GigE + USB）
public MyCamera.MV_CC_DEVICE_INFO_LIST GetDeviceList() {
    var deviceList = new MyCamera.MV_CC_DEVICE_INFO_LIST();
    MyCamera.MV_CC_EnumDevices_NET(
        MyCamera.MV_GIGE_DEVICE | MyCamera.MV_USB_DEVICE, ref deviceList);
    return deviceList;
}

// 2. 连接相机
public bool ConnectCamera(MyCamera.MV_CC_DEVICE_INFO deviceInfo) {
    m_pMyCamera.MV_CC_CreateDevice_NET(ref deviceInfo);  // 创建设备句柄
    m_pMyCamera.MV_CC_OpenDevice_NET();                    // 打开设备
    m_pMyCamera.MV_CC_SetEnumValue_NET("AcquisitionMode", 2);  // 连续采集
    m_pMyCamera.MV_CC_SetEnumValue_NET("TriggerMode", 0);      // 自由模式
    return true;
}

// 3. 采集循环（后台线程）
private void CaptureLoop(MyCamera device, CancellationToken token) {
    while (m_bGrabbing && !token.IsCancellationRequested) {
        int nRet = device.MV_CC_GetImageBuffer_NET(ref stFrameOut, 100);  // 100ms超时
        if (nRet == MyCamera.MV_OK) {
            try {
                // 拷贝原始数据 + 转Halcon图像
                Marshal.Copy(stFrameOut.pBufAddr, imageBuffer, 0, bufSize);
                HOperatorSet.GenImage1(out HObject hobj, "byte", width, height, handle.AddrOfPinnedObject());
                OnImageCaptured?.Invoke(image);  // 事件通知UI
            } finally {
                device.MV_CC_FreeImageBuffer_NET(ref stFrameOut);  // 必须释放
            }
        }
    }
}`,
      explain: "海康 MVS SDK 的完整集成流程：枚举→连接→配置→采集→释放。关键点：(1) MV_CC_EnumDevices_NET 同时搜索 GigE 和 USB 设备；(2) 采集在独立后台线程中循环执行，通过 CancellationToken 安全停止；(3) MV_CC_GetImageBuffer_NET 获取的帧数据必须用 Marshal.Copy 拷贝到托管数组（因为 SDK 会在 FreeImageBuffer 后回收内存）；(4) OnImageCaptured 事件解耦了采集线程和 UI 线程。"
    }
  ],

  "n12": [
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/MainWindow.xaml.cs",
      lines: "L93-99, L166-200, L227-232",
      code: `// 1. 初始化 PLC（西门子 S7-1200）
var plcCfg = AppConfig.Current.PLC;
plc = new SiemensS7Net(SiemensPLCS.S1200, plcCfg.IpAddress) {
    Rack = (byte)plcCfg.Rack,    // 注意：byte 类型
    Slot = (byte)plcCfg.Slot
};

// 2. 心跳监测 + 触发检测（每1000ms）
private void HeartbeatTimer_Tick(object sender, EventArgs e) {
    var heartbeatResult = plc.ReadInt16(plcCfg.HeartbeatAddress);
    if (!heartbeatResult.IsSuccess) {
        // 心跳丢失 → 启动自动重连
        _heartbeatTimer.Stop();
        if (plcCfg.AutoReconnect) _reconnectTimer.Start();
        return;
    }
    // 检测触发信号
    var triggerResult = plc.ReadInt16(plcCfg.TriggerAddress);  // M100
    if (triggerResult.IsSuccess && triggerResult.Content == plcCfg.TriggerValue) {  // 256
        if (!_isRunningDetection) {
            _isRunningDetection = true;  // 防止重入
            StepToNextImageAndDetect("PLC触发");
            plc.Write(plcCfg.TriggerAddress, (short)0);  // 复位触发
            _isRunningDetection = false;
        }
    }
}

// 3. 写回检测结果
plc.Write(plcCfg.ResultAddress, isOK);  // M200 = true/false`,
      explain: "项目使用 HslCommunication 库的 SiemensS7Net 连接西门子 S7-1200 PLC。三个关键地址：M100(触发)、M200(结果)、DB1.0(心跳)。v2.0 修复：Rack/Slot 必须用 byte 类型而非 int。PLC 交互时序：PLC 写 M100=256 触发检测 → 上位机读 M100 检测到触发 → 执行检测 → 写 M200(OK/NG) → 写 M100=0 复位触发。_isRunningDetection 标志防止检测未完成时重复触发。心跳失败后自动启动 5 秒重连定时器。"
    }
  ],

  "n14": [
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/MainWindow.xaml + MainWindow.xaml.cs",
      lines: "XAML L1-31, CS L86-110, L517-535",
      code: `<!-- XAML: 三栏布局 -->
<Grid Background="#1E1E2E">
    <Grid.RowDefinitions>
        <RowDefinition Height="50"/>    <!-- 顶栏 -->
        <RowDefinition Height="*"/>     <!-- 内容区 -->
    </Grid.RowDefinitions>
    <Grid Grid.Row="1" Margin="8">
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="210"/>   <!-- 左：设备状态 -->
            <ColumnDefinition Width="*"/>      <!-- 中：图像显示 -->
            <ColumnDefinition Width="310"/>    <!-- 右：统计日志 -->
        </Grid.ColumnDefinitions>
    </Grid>
</Grid>

// CS: DispatcherTimer 定时器（UI线程安全）
_clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
_clockTimer.Tick += (s, e) => TxtClock.Text = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

_heartbeatTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(1000) };
_heartbeatTimer.Tick += HeartbeatTimer_Tick;

// CS: Dispatcher.BeginInvoke 跨线程更新UI
private void AddLog(string message) {
    Dispatcher.BeginInvoke(new Action(() => {
        var newLine = new TextBlock { Text = $"[{time}] {message}" };
        LogPanel.Children.Insert(0, newLine);
        while (LogPanel.Children.Count > 300)  // 限制日志数量
            LogPanel.Children.RemoveAt(LogPanel.Children.Count - 1);
    }));
}`,
      explain: "项目使用 Code-Behind 模式而非 MVVM（工业软件常见选择，简单直接）。三栏布局是工业 HMI 标准布局：左侧设备状态+控制、中间图像显示、右侧统计+日志。DispatcherTimer 运行在 UI 线程上，Tick 回调可以直接更新控件，不需要 Dispatcher.Invoke。相机采集在后台线程，通过 Dispatcher.BeginInvoke 异步切换到 UI 线程更新界面。日志面板限制 300 条防止内存增长。"
    },
    {
      project: "WPFwithVisionPro",
      file: "Controls/VisionProHostControl.xaml + .xaml.cs",
      lines: "XAML L4, L23-24, CS L35-38",
      code: `<!-- WPF 中嵌入 WinForms 控件（VisionPro 的 CogDisplay 是 WinForms 控件） -->
xmlns:wfint="clr-namespace:System.Windows.Forms.Integration;assembly=WindowsFormsIntegration"

<Grid>
    <wfint:WindowsFormsHost x:Name="ImageHost"/>
    <wfint:WindowsFormsHost x:Name="RecordHost" Visibility="Collapsed"/>
</Grid>

// 代码中创建 VisionPro 显示控件并赋值给 Host
_imgDisplay = new CogDisplay { Dock = WinForms.DockStyle.Fill };
_recDisplay = new CogRecordDisplay { Dock = WinForms.DockStyle.Fill };
ImageHost.Child = _imgDisplay;    // CogDisplay 显示原始图像
RecordHost.Child = _recDisplay;   // CogRecordDisplay 显示带叠加层的运行结果`,
      explain: "VisionPro 的 CogDisplay 和 CogRecordDisplay 是 WinForms 控件，不是原生 WPF 控件。通过 WindowsFormsHost 桥接嵌入 WPF 界面。两个 Host 叠放在同一个 Grid 单元格中，通过 Visibility 切换：加载图片时显示 CogDisplay，运行后显示 CogRecordDisplay（包含图像+检测结果叠加层）。Dock=Fill 是 WinForms 的填充方式，让控件占满 Host 区域。"
    }
  ],

  "n22": [
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/core/HikCameraManager.cs",
      lines: "L56-69, L122-155",
      code: `// 1. 启动采集线程
public void StartGrabbing() {
    m_bGrabbing = true;
    m_cts = new CancellationTokenSource();
    m_CaptureThread = new Thread(() => CaptureLoop(m_pMyCamera, m_cts.Token)) {
        IsBackground = true  // 后台线程，不阻止程序退出
    };
    m_CaptureThread.Start();
}

// 2. 安全停止线程（CancellationToken 协作式取消）
public void StopGrabbing() {
    m_bGrabbing = false;
    m_cts.Cancel();           // 发出取消信号
    m_cts.Dispose();
    m_pMyCamera.MV_CC_StopGrabbing_NET();
    m_pMyCamera.MV_CC_CloseDevice_NET();
    if (m_CaptureThread.IsAlive)
        m_CaptureThread.Join(2000);  // 等待最多2秒
}

// 3. 采集循环检查取消令牌
while (m_bGrabbing && !token.IsCancellationRequested) {
    // ... 采集逻辑 ...
}`,
      explain: "v2.0 的关键改进：用 CancellationToken 替代了危险的 Thread.Abort()。采集循环在 while 条件中检查 token.IsCancellationRequested，收到取消信号后自然退出循环。StopGrabbing 先 Cancel() 再 Join(2000)，给线程 2 秒时间优雅退出。Thread.IsBackground=true 确保程序关闭时不会被采集线程阻塞。"
    }
  ],

  "n32": [
    {
      project: "FirstDemo-WPFwithHalcon",
      file: "MyVisionDemo/core/AppConfig.cs + HObjectExtensions.cs",
      lines: "AppConfig L11-28, HObjectExtensions L10-116",
      code: `// 1. 配置管理：单例模式 + JSON 序列化
public static class AppConfig {
    private static ConfigModel _config;
    public static ConfigModel Current {
        get { if (_config == null) Load(); return _config; }
    }
    public static void Load() {
        string json = File.ReadAllText(_configPath);
        _config = JsonConvert.DeserializeObject<ConfigModel>(json) ?? CreateDefault();
    }
}

// 2. 扩展方法：封装 HOperatorSet 为链式 API
public static class HObjectExtensions {
    public static HObject ReduceDomain(this HObject image, HObject region) {
        HObject result;
        HOperatorSet.ReduceDomain(image, region, out result);
        return result;
    }
    public static HObject Threshold(this HObject image, double min, double max) {
        HObject result;
        HOperatorSet.Threshold(image, out result, min, max);
        return result;
    }
    // 使用方式：image.ReduceDomain(roi).Threshold(70, 130).Connection().SelectShape("area", "and", 100, 99999)
}`,
      explain: "项目展示了两个重要的架构实践：(1) AppConfig 用静态类+懒加载实现单例模式，配置参数从 appsettings.json 读取，包含 PLC/Detection/Camera/Archive 六个配置节；(2) HObjectExtensions 用 C# 扩展方法封装 HOperatorSet 的 out 参数风格为链式调用，使 Halcon 代码可以像 jQuery 一样流式写：image.ReduceDomain(roi).Threshold(70,130).Connection()。SafeDisposeAll 方法在 finally 块中安全释放所有 HObject 资源。"
    }
  ],

  "n46": [
    {
      project: "WPFwithVisionPro",
      file: "Controls/VisionProHostControl.xaml.cs",
      lines: "L50-101, L195-237",
      code: `// 1. 加载 .vpp 文件（反序列化）
_vpp = CogSerializer.LoadObjectFromFile(path);

// 2. 类型判断（三种可能的 VPP 类型）
if (_vpp is CogToolBlock tb) {
    _kind = VppKind.ToolBlock;
    // 遍历 Inputs/Outputs 终端
    foreach (CogToolBlockTerminal t in tb.Inputs) {
        bool isImage = typeof(ICogImage).IsAssignableFrom(t.ValueType);
        // 为每个终端创建输入框
    }
} else if (_vpp is CogJobManager jm) {
    _kind = VppKind.JobManager;
    // QuickBuild：遍历 Jobs
    for (int i = 0; i < jm.JobCount; i++) {
        CogJob job = jm.Job(i);
        string toolName = job?.VisionTool?.GetType().Name ?? "null";
    }
} else if (_vpp is ICogTool tool) {
    _kind = VppKind.Tool;
}

// 3. 运行并获取结果
tb.Run();  // 或 job.Run() 或 tool.Run()
ICogRecord record = tb.CreateLastRunRecord();
_recDisplay.Record = record;  // 显示带叠加层的运行结果`,
      explain: "VisionPro 的 .vpp 文件用 CogSerializer.LoadObjectFromFile 反序列化，可能返回三种类型：CogToolBlock（工具块，有明确输入输出终端）、CogJobManager（QuickBuild 工程文件，包含多个 Job）、ICogTool（单个工具如 PMAlign/Blob）。项目用 C# 模式匹配（is + 变量声明）判断类型。CogToolBlock.Inputs/Outputs 是终端集合，每个终端有 Name/ValueType/Value。运行后 CreateLastRunRecord() 返回 ICogRecord 结构，包含图像和检测结果的图形叠加层。"
    },
    {
      project: "WPFwithVisionPro",
      file: "Controls/VisionProHostControl.xaml.cs",
      lines: "L243-390",
      code: `// 绕过 AcqFifo 注入图像：三种策略
private ICogRecord RunJobWithImage(CogJob job, ICogImage img) {
    ICogTool vt = job.VisionTool;

    // 策略1: CogToolBlock → 直接设置图像终端
    if (vt is CogToolBlock tb)
        SetImageOnToolBlock(tb, img);  // 遍历 Inputs 找 ICogImage 终端
    // 策略2: CogToolGroup → 反射+子工具遍历
    else if (vt is CogToolGroup tg)
        SetImageOnToolGroup(tg, img);  // SetScriptTerminalData + 遍历子工具
    // 策略3: 其他 → 反射设置 InputImage 属性
    else
        TrySetInputImage(vt, img);  // tool.GetType().GetProperty("InputImage")

    vt.Run();  // 直接运行视觉工具，不触发 AcqFifo
    return vt.CreateLastRunRecord();
}`,
      explain: "这是 VisionPro 开发中的核心技术难点。QuickBuild 工程的 CogJob 通常通过 AcqFifo（采集 FIFO）获取相机图像，但测试时需要注入磁盘图片。项目实现了三级策略：(1) CogToolBlock 直接设置图像终端的 Value；(2) CogToolGroup 用反射调用 SetScriptTerminalData 并遍历子工具；(3) 其他工具用反射设置 InputImage 属性。关键是调用 vt.Run() 而非 job.Run()——前者只运行视觉工具不触发采集，后者会触发完整的 AcqFifo 流程。"
    }
  ],

  "n51": [
    {
      project: "WPFwithVisionPro",
      file: "Controls/VisionProHostControl.xaml.cs",
      lines: "L311-332, L376-390",
      code: `// 1. 反射调用 SetScriptTerminalData（CogToolGroup 没有公开的终端集合）
string[] commonKeys = { "InputImage", "Image", "inputImage", "image", "InputImageTerminal" };
foreach (string key in commonKeys) {
    var method = tg.GetType().GetMethod("SetScriptTerminalData",
        new[] { typeof(string), typeof(object) });
    if (method != null) {
        bool result = (bool)method.Invoke(tg, new object[] { key, img });
        if (result) break;  // 找到匹配的终端名就退出
    }
}

// 2. 反射设置 InputImage 属性（通用兜底方案）
private bool TrySetInputImage(object tool, ICogImage img) {
    var prop = tool.GetType().GetProperty("InputImage");
    if (prop != null && prop.CanWrite) {
        prop.SetValue(tool, img);
        return true;
    }
    return false;
}`,
      explain: "项目中反射的两个核心应用场景：(1) CogToolGroup 的 SetScriptTerminalData 方法不是公开 API，通过反射调用并尝试多个常见终端名（InputImage/Image 等），直到找到匹配的。(2) 很多 VisionPro 工具（CogPMAlignTool、CogBlobTool 等）都有 InputImage 属性但接口不统一，用反射 GetProperty('InputImage') + SetValue 统一处理。这种反射兜底策略让程序能适配各种未知的 .vpp 文件结构。"
    }
  ],

  "n52": [
    {
      project: "WPFwithVisionPro",
      file: "Controls/VisionProHostControl.xaml.cs",
      lines: "L243-390",
      code: `// 策略模式：三种图像注入策略按优先级尝试
private ICogRecord RunJobWithImage(CogJob job, ICogImage img) {
    ICogTool vt = job.VisionTool;

    // 策略1: CogToolBlock（最干净的方式）
    if (vt is CogToolBlock tb)
        SetImageOnToolBlock(tb, img);
    // 策略2: CogToolGroup（需要反射）
    else if (vt is CogToolGroup tg)
        SetImageOnToolGroup(tg, img);
    // 策略3: 通用工具（反射兜底）
    else
        TrySetInputImage(vt, img);

    vt.Run();
    return vt.CreateLastRunRecord();
}`,
      explain: "项目使用策略模式处理 VisionPro 不同工具类型的图像注入问题。三种策略按优先级尝试：CogToolBlock 最直接（直接设置终端值），CogToolGroup 需要反射调用脚本终端，最后用反射设置 InputImage 属性兜底。这本质上也是责任链模式——每个策略尝试处理，处理不了就传给下一个。项目还用了工厂模式：CameraFactory.Create(brand) 根据品牌创建不同相机实例。"
    }
  ]
};
