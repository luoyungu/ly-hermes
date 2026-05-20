!include LogicLib.nsh

!macro customUnInstall
  DetailPrint "Removing Hermes Desktop data: $PROFILE\.lyhermes"
  RMDir /r "$PROFILE\.lyhermes"

  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除 Hermes Agent 与所有员工数据？$\r$\n$\r$\n这会删除 $PROFILE\.hermes，包含员工资料、会话、日程、密钥与本地依赖。删除后不可恢复。" IDNO +3
      DetailPrint "Removing Hermes Agent data: $PROFILE\.hermes"
      RMDir /r "$PROFILE\.hermes"
  ${EndIf}
!macroend
