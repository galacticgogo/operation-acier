local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage.Config)
local player = Players.LocalPlayer
local getProfile = ReplicatedStorage:WaitForChild("GetProfile")
local completeMission = ReplicatedStorage:WaitForChild("CompleteMission")
local adminCommand = ReplicatedStorage:WaitForChild("AdminCommand")

local gui = Instance.new("ScreenGui")
gui.Name = "OperationAcierHUD"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local frame = Instance.new("Frame")
frame.Size = UDim2.fromOffset(340, 82)
frame.Position = UDim2.fromOffset(18, 18)
frame.BackgroundColor3 = Color3.fromRGB(15, 20, 14)
frame.BackgroundTransparency = 0.12
frame.Parent = gui

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -16, 0, 28)
title.Position = UDim2.fromOffset(8, 6)
title.BackgroundTransparency = 1
title.TextColor3 = Color3.fromRGB(232, 163, 61)
title.Text = "OPERATION ACIER"
title.TextXAlignment = Enum.TextXAlignment.Left
title.TextSize = 21
title.Font = Enum.Font.GothamBold
title.Parent = frame

local stats = Instance.new("TextLabel")
stats.Size = UDim2.new(1, -16, 0, 30)
stats.Position = UDim2.fromOffset(8, 38)
stats.BackgroundTransparency = 1
stats.TextColor3 = Color3.fromRGB(236, 231, 214)
stats.TextXAlignment = Enum.TextXAlignment.Left
stats.TextSize = 15
stats.Font = Enum.Font.Gotham
stats.Parent = frame

local function refresh()
    local profile = getProfile:InvokeServer()
    if profile then
        stats.Text = string.format("ARGENT %s   GEMMES %s   POP %s", profile.Money, profile.Gems, profile.Population)
    end
end

if Config.IsAdmin(player) then
    local admin = Instance.new("TextButton")
    admin.Size = UDim2.fromOffset(120, 36)
    admin.Position = UDim2.new(1, -138, 0, 18)
    admin.Text = "ADMIN +∞"
    admin.TextSize = 15
    admin.Font = Enum.Font.GothamBold
    admin.TextColor3 = Color3.fromRGB(12, 13, 9)
    admin.BackgroundColor3 = Color3.fromRGB(232, 163, 61)
    admin.Parent = gui
    admin.MouseButton1Click:Connect(function()
        adminCommand:FireServer("infinite", player.UserId)
        task.wait(0.2)
        refresh()
    end)
end

refresh()
