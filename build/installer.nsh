!include LogicLib.nsh

!macro customUnInstall
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "是否删除 LyHermes 桌面端设置？$\r$\n$\r$\n这会删除 $PROFILE\.lyhermes，包含运行模式、登录用户、模型配置和界面设置。删除后不可恢复。" IDNO +3
      DetailPrint "Removing Hermes Desktop data: $PROFILE\.lyhermes"
      RMDir /r "$PROFILE\.lyhermes"

    MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除 Hermes Agent 与所有员工数据？$\r$\n$\r$\n这会删除 $PROFILE\.hermes，包含员工资料、会话、日程、密钥与本地依赖。删除后不可恢复。" IDNO +3
      DetailPrint "Removing Hermes Agent data: $PROFILE\.hermes"
      RMDir /r "$PROFILE\.hermes"
  ${EndIf}
!macroend
