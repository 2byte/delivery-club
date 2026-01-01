' Silent launcher for Soft Delivery Client
' Runs client.exe without showing console window
' All output goes to log file

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get script directory
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Get command line arguments
strArgs = "pull"
If WScript.Arguments.Count > 0 Then
    strArgs = ""
    For i = 0 To WScript.Arguments.Count - 1
        If i > 0 Then strArgs = strArgs & " "
        strArgs = strArgs & WScript.Arguments(i)
    Next
End If

' Build command
strCommand = Chr(34) & strScriptPath & "\client.exe" & Chr(34) & " " & strArgs

' Run hidden (0 = hidden, True = wait for completion)
intResult = objShell.Run(strCommand, 0, True)

' Exit with same code
WScript.Quit intResult
