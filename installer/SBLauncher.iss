#define MyAppName "SB Launcher"
#define MyAppVersion "2.3.2"
#define MyAppPublisher "SB Launcher"
#define MyAppExeName "SB Launcher.exe"

[Setup]
AppId={{82E8C580-9478-4CF9-B6C8-C8B2D24C8897}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\SB Launcher
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableWelcomePage=yes
ShowLanguageDialog=no
LanguageDetectionMethod=none
OutputDir=..\release
OutputBaseFilename=SB-Launcher-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardImageFile=assets\wizard-banner.bmp,assets\wizard-banner-200.bmp
WizardSmallImageFile=assets\wizard-small.bmp,assets\wizard-small-200.bmp
UsePreviousAppDir=yes
UsePreviousGroup=yes
SetupIconFile=..\apps\native\Assets\SBLauncher.ico
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[CustomMessages]
UninstallRemoveDataTitle=Remove saved data?
UninstallRemoveDataPrompt=Also remove saved SB Launcher data (account, themes, launch screen, favorites)?%n%nChoose No to keep your data for the next install.
YesButton=Yes
NoButton=No

[Files]
Source: "..\release\native\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Classes\sblauncher"; ValueType: string; ValueName: ""; ValueData: "URL:SB Launcher Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\sblauncher"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\sblauncher\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\SB Launcher"; Check: UninstallRemoveSavedData

[Code]
{ SB Launcher dark theme — classic purple progress bar. }
{ TColor/COLORREF are BGR, so hex values below are reversed. }
const
  BgColor = $181214;         { #141218 }
  SurfaceColor = $201B1D;    { #1d1b20 }
  SurfaceElevated = $302B2B; { #2b2930 }
  TextColor = $E5E1E6;       { #e6e1e5 }
  MutedColor = $D0C4CA;      { #cac4d0 }
  AccentColor = $DB829A;     { #9a82db }
  AccentTonal = $523D4E;     { lavender tonal container }
  AccentSecondary = $C8B8EF; { #efb8c8 }

  GWL_EXSTYLE = -20;
  WS_EX_LAYERED = $80000;
  LWA_ALPHA = 2;
  PBM_SETBARCOLOR = $409;
  PBM_SETBKCOLOR = $2001;

function SetWindowTheme(hWnd: LongWord; pszSubAppName, pszSubIdList: string): Integer;
  external 'SetWindowTheme@uxtheme.dll stdcall';
function DwmSetWindowAttribute(hWnd: LongWord; dwAttribute: LongWord;
  var pvAttribute: Integer; cbAttribute: LongWord): Integer;
  external 'DwmSetWindowAttribute@dwmapi.dll stdcall delayload';
function GetWindowLong(hWnd: LongWord; nIndex: Integer): LongInt;
  external 'GetWindowLongW@user32.dll stdcall';
function SetWindowLong(hWnd: LongWord; nIndex: Integer; dwNewLong: LongInt): LongInt;
  external 'SetWindowLongW@user32.dll stdcall';
function SetLayeredWindowAttributes(hWnd: LongWord; crKey: LongWord;
  bAlpha: LongWord; dwFlags: LongWord): Integer;
  external 'SetLayeredWindowAttributes@user32.dll stdcall';
function SetTimer(hWnd: LongWord; nIDEvent: LongWord; uElapse: LongWord;
  lpTimerFunc: LongWord): LongWord;
  external 'SetTimer@user32.dll stdcall';
function KillTimer(hWnd: LongWord; uIDEvent: LongWord): Integer;
  external 'KillTimer@user32.dll stdcall';

var
  FadeAlpha: Integer;
  FadeTimer: LongWord;
  FadeCallback: LongWord;

procedure ApplyDarkChrome(hWnd: LongWord);
var
  Value: Integer;
begin
  try
    Value := 1;
    DwmSetWindowAttribute(hWnd, 20, Value, 4);
    Value := BgColor;
    DwmSetWindowAttribute(hWnd, 35, Value, 4);
    Value := TextColor;
    DwmSetWindowAttribute(hWnd, 36, Value, 4);
  except
  end;
end;

function ShowDarkConfirm(const Message, Caption: String): Boolean;
var
  Form: TSetupForm;
  Title, Body: TNewStaticText;
  YesBtn, NoBtn: TNewButton;
begin
  Form := CreateCustomForm(ScaleX(500), ScaleY(210), False, True);
  try
    Form.Caption := Caption;
    Form.Color := BgColor;
    ApplyDarkChrome(Form.Handle);

    Title := TNewStaticText.Create(Form);
    Title.Parent := Form;
    Title.Left := ScaleX(20);
    Title.Top := ScaleY(16);
    Title.Width := Form.ClientWidth - ScaleX(40);
    Title.Caption := Caption;
    Title.Font.Style := [fsBold];
    Title.Font.Color := TextColor;
    Title.AutoSize := True;

    Body := TNewStaticText.Create(Form);
    Body.Parent := Form;
    Body.Left := ScaleX(20);
    Body.Top := ScaleY(52);
    Body.Width := Form.ClientWidth - ScaleX(40);
    Body.Height := ScaleY(90);
    Body.Caption := Message;
    Body.Font.Color := MutedColor;
    Body.WordWrap := True;

    YesBtn := TNewButton.Create(Form);
    YesBtn.Parent := Form;
    YesBtn.Caption := ExpandConstant('{cm:YesButton}');
    YesBtn.Width := ScaleX(96);
    YesBtn.Height := ScaleY(28);
    YesBtn.Left := Form.ClientWidth - ScaleX(220);
    YesBtn.Top := Form.ClientHeight - ScaleY(48);
    YesBtn.ModalResult := mrYes;
    SetWindowTheme(YesBtn.Handle, 'DarkMode_Explorer', '');

    NoBtn := TNewButton.Create(Form);
    NoBtn.Parent := Form;
    NoBtn.Caption := ExpandConstant('{cm:NoButton}');
    NoBtn.Width := ScaleX(96);
    NoBtn.Height := ScaleY(28);
    NoBtn.Left := Form.ClientWidth - ScaleX(112);
    NoBtn.Top := Form.ClientHeight - ScaleY(48);
    NoBtn.ModalResult := mrNo;
    NoBtn.Cancel := True;
    SetWindowTheme(NoBtn.Handle, 'DarkMode_Explorer', '');

    Form.ActiveControl := NoBtn;
    if WizardForm <> nil then
      Form.FlipAndCenterIfNeeded(True, WizardForm, False);
    Result := Form.ShowModal = mrYes;
  finally
  end;
end;

function UninstallRemoveSavedData(): Boolean;
begin
  Result := ShowDarkConfirm(
    ExpandConstant('{cm:UninstallRemoveDataPrompt}'),
    ExpandConstant('{cm:UninstallRemoveDataTitle}'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    if DirExists(ExpandConstant('{app}\runtime\web')) then
      DelTree(ExpandConstant('{app}\runtime\web'), False, True, False);
    if FileExists(ExpandConstant('{app}\runtime\api\index.cjs')) then
      DeleteFile(ExpandConstant('{app}\runtime\api\index.cjs'));
    if FileExists(ExpandConstant('{app}\runtime\build-info.json')) then
      DeleteFile(ExpandConstant('{app}\runtime\build-info.json'));
  end;
  if CurStep = ssPostInstall then
  begin
    { Drop live UI overlay + cache so first launch reseeds from the packaged runtime\web. }
    if DirExists(ExpandConstant('{localappdata}\SB Launcher\runtime-web')) then
      DelTree(ExpandConstant('{localappdata}\SB Launcher\runtime-web'), True, True, True);
    if DirExists(ExpandConstant('{localappdata}\SB Launcher\WebView2')) then
      DelTree(ExpandConstant('{localappdata}\SB Launcher\WebView2'), True, True, True);
    if FileExists(ExpandConstant('{localappdata}\SB Launcher\web-bundle.txt')) then
      DeleteFile(ExpandConstant('{localappdata}\SB Launcher\web-bundle.txt'));
    if FileExists(ExpandConstant('{localappdata}\SB Launcher\installed-build.txt')) then
      DeleteFile(ExpandConstant('{localappdata}\SB Launcher\installed-build.txt'));
  end;
end;

procedure FadeTimerProc(hWnd: LongWord; uMsg: LongWord; idEvent: LongWord; dwTime: LongWord);
begin
  FadeAlpha := FadeAlpha + 18;
  if FadeAlpha >= 255 then
  begin
    FadeAlpha := 255;
    if FadeTimer <> 0 then
    begin
      KillTimer(0, FadeTimer);
      FadeTimer := 0;
    end;
  end;
  SetLayeredWindowAttributes(WizardForm.Handle, 0, FadeAlpha, LWA_ALPHA);
end;

procedure StartFade(FromAlpha: Integer);
begin
  if FadeCallback = 0 then
    FadeCallback := CreateCallback(@FadeTimerProc);
  FadeAlpha := FromAlpha;
  SetLayeredWindowAttributes(WizardForm.Handle, 0, FadeAlpha, LWA_ALPHA);
  if FadeTimer <> 0 then
  begin
    KillTimer(0, FadeTimer);
    FadeTimer := 0;
  end;
  FadeTimer := SetTimer(0, 0, 14, FadeCallback);
  if FadeTimer = 0 then
    SetLayeredWindowAttributes(WizardForm.Handle, 0, 255, LWA_ALPHA);
end;

procedure ApplyDarkTitleBar;
begin
  ApplyDarkChrome(WizardForm.Handle);
end;

procedure StyleControls(Parent: TWinControl);
var
  I: Integer;
  C: TControl;
begin
  for I := 0 to Parent.ControlCount - 1 do
  begin
    C := Parent.Controls[I];
    if C is TNewStaticText then
    begin
      TNewStaticText(C).Font.Color := TextColor;
    end
    else if C is TNewCheckListBox then
    begin
      TNewCheckListBox(C).Color := BgColor;
      TNewCheckListBox(C).Font.Color := TextColor;
      SetWindowTheme(TNewCheckListBox(C).Handle, 'DarkMode_Explorer', '');
    end
    else if C is TNewMemo then
    begin
      TNewMemo(C).Color := SurfaceColor;
      TNewMemo(C).Font.Color := TextColor;
      SetWindowTheme(TNewMemo(C).Handle, 'DarkMode_Explorer', '');
    end
    else if C is TEdit then
    begin
      TEdit(C).Color := SurfaceColor;
      TEdit(C).Font.Color := TextColor;
      SetWindowTheme(TEdit(C).Handle, 'DarkMode_CFD', '');
    end
    else if C is TNewButton then
    begin
      SetWindowTheme(TNewButton(C).Handle, 'DarkMode_Explorer', '');
      TNewButton(C).Font.Color := TextColor;
    end
    else if C is TPanel then
    begin
      TPanel(C).BevelOuter := bvNone;
      TPanel(C).BevelInner := bvNone;
      TPanel(C).BorderWidth := 0;
      TPanel(C).ParentBackground := False;
      TPanel(C).Cursor := crHand;
      TPanel(C).Font.Color := TextColor;
    end
    else if C is TNewRadioButton then
    begin
      TNewRadioButton(C).Font.Color := TextColor;
      SetWindowTheme(TNewRadioButton(C).Handle, ' ', ' ');
    end;
    if C is TWinControl then
      StyleControls(TWinControl(C));
  end;
end;

procedure StyleWizard;
begin
  WizardForm.Color := BgColor;
  WizardForm.MainPanel.Color := BgColor;
  WizardForm.Bevel.Visible := False;
  WizardForm.Bevel1.Visible := False;

  WizardForm.WelcomePage.Color := BgColor;
  WizardForm.InnerPage.Color := BgColor;
  WizardForm.FinishedPage.Color := BgColor;
  WizardForm.LicensePage.Color := BgColor;
  WizardForm.PasswordPage.Color := BgColor;
  WizardForm.InfoBeforePage.Color := BgColor;
  WizardForm.UserInfoPage.Color := BgColor;
  WizardForm.SelectDirPage.Color := BgColor;
  WizardForm.SelectComponentsPage.Color := BgColor;
  WizardForm.SelectProgramGroupPage.Color := BgColor;
  WizardForm.SelectTasksPage.Color := BgColor;
  WizardForm.ReadyPage.Color := BgColor;
  WizardForm.PreparingPage.Color := BgColor;
  WizardForm.InstallingPage.Color := BgColor;
  WizardForm.InfoAfterPage.Color := BgColor;

  StyleControls(WizardForm);

  WizardForm.PageDescriptionLabel.Font.Color := MutedColor;
  WizardForm.WelcomeLabel2.Font.Color := MutedColor;
  WizardForm.FinishedLabel.Font.Color := MutedColor;
  WizardForm.SelectDirBrowseLabel.Font.Color := MutedColor;
  WizardForm.SelectTasksLabel.Font.Color := MutedColor;
  WizardForm.DiskSpaceLabel.Font.Color := MutedColor;
  WizardForm.FileNameLabel.Font.Color := MutedColor;

  WizardForm.PageNameLabel.Font.Color := TextColor;
  WizardForm.WelcomeLabel1.Font.Color := TextColor;
  WizardForm.FinishedHeadingLabel.Font.Color := TextColor;

  { Classic purple progress bar on a dark track. }
  SetWindowTheme(WizardForm.ProgressGauge.Handle, ' ', ' ');
  SendMessage(WizardForm.ProgressGauge.Handle, PBM_SETBKCOLOR, 0, SurfaceColor);
  SendMessage(WizardForm.ProgressGauge.Handle, PBM_SETBARCOLOR, 0, AccentColor);
end;

procedure InitializeWizard;
begin
  ApplyDarkTitleBar;
  StyleWizard;
  SetWindowLong(WizardForm.Handle, GWL_EXSTYLE,
    GetWindowLong(WizardForm.Handle, GWL_EXSTYLE) or WS_EX_LAYERED);
  StartFade(40);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  StyleControls(WizardForm);
  StartFade(175);
  if CurPageID = wpInstalling then
  begin
    SetWindowTheme(WizardForm.ProgressGauge.Handle, ' ', ' ');
    SendMessage(WizardForm.ProgressGauge.Handle, PBM_SETBKCOLOR, 0, SurfaceColor);
    SendMessage(WizardForm.ProgressGauge.Handle, PBM_SETBARCOLOR, 0, AccentColor);
  end;
end;

procedure DeinitializeSetup;
begin
  if FadeTimer <> 0 then
  begin
    KillTimer(0, FadeTimer);
    FadeTimer := 0;
  end;
end;
