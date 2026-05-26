!include LogicLib.nsh

!macro customUnInstall
  ${IfNot} ${Silent}
    System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
    IntOp $1 $0 & 0x3FF
    IntCmp $1 4 lyh_uninst_zh lyh_uninst_en lyh_uninst_en

    lyh_uninst_en:
      MessageBox MB_YESNO|MB_ICONQUESTION "Delete LyHermes desktop settings?$\r$\n$\r$\nThis will remove $PROFILE\.lyhermes, including deployment mode, login users, model configs and UI settings. This action cannot be undone." IDNO lyh_uninst_agent_en
      DetailPrint "Removing Hermes Desktop data: $PROFILE\.lyhermes"
      RMDir /r "$PROFILE\.lyhermes"
      Goto lyh_uninst_agent_en

    lyh_uninst_zh:
      MessageBox MB_YESNO|MB_ICONQUESTION "是否删除 LyHermes 桌面端设置？$\r$\n$\r$\n这会删除 $PROFILE\.lyhermes，包含运行模式、登录用户、模型配置和界面设置。删除后不可恢复。" IDNO lyh_uninst_agent_zh
      DetailPrint "Removing Hermes Desktop data: $PROFILE\.lyhermes"
      RMDir /r "$PROFILE\.lyhermes"
      Goto lyh_uninst_agent_zh

    lyh_uninst_agent_en:
      MessageBox MB_YESNO|MB_ICONQUESTION "Also delete Hermes Agent and all employee data?$\r$\n$\r$\nThis will remove $PROFILE\.hermes, including agent profiles, sessions, schedules, keys and local dependencies. This action cannot be undone." IDNO lyh_uninst_done
      DetailPrint "Removing Hermes Agent data: $PROFILE\.hermes"
      RMDir /r "$PROFILE\.hermes"
      Goto lyh_uninst_done

    lyh_uninst_agent_zh:
      MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除 Hermes Agent 与所有员工数据？$\r$\n$\r$\n这会删除 $PROFILE\.hermes，包含员工资料、会话、日程、密钥与本地依赖。删除后不可恢复。" IDNO lyh_uninst_done
      DetailPrint "Removing Hermes Agent data: $PROFILE\.hermes"
      RMDir /r "$PROFILE\.hermes"

    lyh_uninst_done:
  ${EndIf}
!macroend
