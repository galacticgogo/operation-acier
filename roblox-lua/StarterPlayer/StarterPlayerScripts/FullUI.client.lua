local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local Config = require(ReplicatedStorage.Config)
local getProfile = ReplicatedStorage:WaitForChild("GetProfile")
local completeMission = ReplicatedStorage:WaitForChild("CompleteMission")
local adminCommand = ReplicatedStorage:WaitForChild("AdminCommand")

local colors = {
    Ink = Color3.fromRGB(12, 13, 9),
    Panel = Color3.fromRGB(24, 26, 18),
    Panel2 = Color3.fromRGB(31, 34, 23),
    Line = Color3.fromRGB(58, 61, 41),
    Amber = Color3.fromRGB(232, 163, 61),
    Paper = Color3.fromRGB(236, 231, 214),
    Dim = Color3.fromRGB(169, 166, 144),
    Green = Color3.fromRGB(127, 174, 92),
    Red = Color3.fromRGB(193, 71, 59),
    Cyan = Color3.fromRGB(79, 195, 201),
}

local gui = Instance.new("ScreenGui")
gui.Name = "OperationAcierFullUI"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local function corner(parent, radius)
    local ui = Instance.new("UICorner")
    ui.CornerRadius = UDim.new(0, radius or 6)
    ui.Parent = parent
end

local function stroke(parent, color, thickness)
    local ui = Instance.new("UIStroke")
    ui.Color = color or colors.Line
    ui.Thickness = thickness or 1
    ui.Transparency = 0.15
    ui.Parent = parent
end

local function label(parent, text, size, color, font)
    local item = Instance.new("TextLabel")
    item.BackgroundTransparency = 1
    item.Text = text
    item.TextColor3 = color or colors.Paper
    item.TextSize = size or 16
    item.Font = font or Enum.Font.Gotham
    item.TextXAlignment = Enum.TextXAlignment.Left
    item.Parent = parent
    return item
end

local function button(parent, text)
    local item = Instance.new("TextButton")
    item.AutoButtonColor = true
    item.BackgroundColor3 = colors.Panel2
    item.TextColor3 = colors.Paper
    item.Text = text
    item.TextSize = 15
    item.Font = Enum.Font.GothamBold
    item.Parent = parent
    corner(item, 5)
    stroke(item)
    return item
end

local top = Instance.new("Frame")
top.Size = UDim2.new(1, -36, 0, 74)
top.Position = UDim2.fromOffset(18, 18)
top.BackgroundColor3 = colors.Panel
top.BackgroundTransparency = 0.05
top.Parent = gui
corner(top, 8)
stroke(top, colors.Line, 2)

local title = label(top, "OPERATION ACIER", 25, colors.Amber, Enum.Font.GothamBlack)
title.Position = UDim2.fromOffset(18, 9)
title.Size = UDim2.fromOffset(250, 28)
local subtitle = label(top, "CENTRE DE COMMANDement", 11, colors.Dim, Enum.Font.Gotham)
subtitle.Position = UDim2.fromOffset(20, 39)
subtitle.Size = UDim2.fromOffset(250, 18)

local stats = Instance.new("Frame")
stats.BackgroundTransparency = 1
stats.Position = UDim2.new(0, 285, 0, 10)
stats.Size = UDim2.new(1, -470, 1, -20)
stats.Parent = top
local statsLayout = Instance.new("UIListLayout")
statsLayout.FillDirection = Enum.FillDirection.Horizontal
statsLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
statsLayout.VerticalAlignment = Enum.VerticalAlignment.Center
statsLayout.Padding = UDim.new(0, 22)
statsLayout.Parent = stats

local statLabels = {}
for _, name in ipairs({"ARGENT", "GEMMES", "POPULATION", "NIVEAU"}) do
    local item = label(stats, name .. "  --", 14, colors.Paper, Enum.Font.GothamBold)
    item.Size = UDim2.fromOffset(125, 35)
    item.TextYAlignment = Enum.TextYAlignment.Center
    statLabels[name] = item
end

local logout = button(top, "DECONNEXION")
logout.Size = UDim2.fromOffset(132, 42)
logout.Position = UDim2.new(1, -150, 0, 16)
logout.MouseButton1Click:Connect(function()
    player:Kick("Deconnexion demandee")
end)

local content = Instance.new("Frame")
content.Size = UDim2.new(1, -36, 1, -112)
content.Position = UDim2.fromOffset(18, 100)
content.BackgroundColor3 = colors.Ink
content.BackgroundTransparency = 0.08
content.Parent = gui
corner(content, 8)
stroke(content)

local navigation = Instance.new("Frame")
navigation.Size = UDim2.fromOffset(168, 1)
navigation.Position = UDim2.fromOffset(12, 12)
navigation.AnchorPoint = Vector2.new(0, 0)
navigation.BackgroundTransparency = 1
navigation.Parent = content
local navLayout = Instance.new("UIListLayout")
navLayout.Padding = UDim.new(0, 8)
navLayout.Parent = navigation

local pages = Instance.new("Frame")
pages.Size = UDim2.new(1, -202, 1, -24)
pages.Position = UDim2.fromOffset(190, 12)
pages.BackgroundTransparency = 1
pages.Parent = content

local pageObjects = {}
local function page(name, heading)
    local panel = Instance.new("Frame")
    panel.Name = name
    panel.Size = UDim2.fromScale(1, 1)
    panel.BackgroundColor3 = colors.Panel
    panel.Visible = false
    panel.Parent = pages
    corner(panel, 7)
    stroke(panel)
    local head = label(panel, heading, 26, colors.Amber, Enum.Font.GothamBlack)
    head.Position = UDim2.fromOffset(22, 18)
    head.Size = UDim2.new(1, -44, 0, 36)
    local line = Instance.new("Frame")
    line.Size = UDim2.new(1, -44, 0, 1)
    line.Position = UDim2.fromOffset(22, 62)
    line.BackgroundColor3 = colors.Line
    line.Parent = panel
    pageObjects[name] = panel
    return panel
end

local mapPage = page("Map", "CARTE DE CAMPAGNE")
local shopPage = page("Shop", "BOUTIQUE")
local marketPage = page("Market", "MARCHE")
local missionsPage = page("Missions", "MISSIONS")
local clanPage = page("Clan", "QG DU CLAN")
local rankingPage = page("Ranking", "CLASSEMENT")

local mapBoard = Instance.new("Frame")
mapBoard.Size = UDim2.new(1, -44, 1, -100)
mapBoard.Position = UDim2.fromOffset(22, 82)
mapBoard.BackgroundColor3 = Color3.fromRGB(43, 75, 48)
mapBoard.Parent = mapPage
corner(mapBoard, 8)
stroke(mapBoard, colors.Green, 2)

local mapTitle = label(mapBoard, "THEATRE D'OPERATIONS", 22, colors.Paper, Enum.Font.GothamBlack)
mapTitle.Position = UDim2.fromOffset(20, 18)
mapTitle.Size = UDim2.new(1, -40, 0, 30)

local mapHint = label(mapBoard, "Choisis une zone pour poursuivre ta campagne", 14, colors.Dim)
mapHint.Position = UDim2.fromOffset(20, 50)
mapHint.Size = UDim2.new(1, -40, 0, 22)

local function locationCard(location)
    local item = button(mapBoard, location.Label)
    item.Size = UDim2.fromOffset(170, 62)
    item.Position = UDim2.new(0.5, location.Position.X * 1.7, 0.5, location.Position.Z * 1.1)
    item.BackgroundColor3 = location.Color
    item.TextColor3 = colors.Ink
    item.TextWrapped = true
    item.MouseButton1Click:Connect(function()
        if location.Id == "Missions" then
            mapPage.Visible = false
            missionsPage.Visible = true
        end
    end)
end
for _, location in ipairs(Config.Locations) do locationCard(location) end

local base = button(mapBoard, "BASE\nPRINCIPALE")
base.Size = UDim2.fromOffset(150, 74)
base.Position = UDim2.new(0.5, -75, 0.5, -37)
base.BackgroundColor3 = colors.Amber
base.TextColor3 = colors.Ink
base.TextWrapped = true

local function addPageList(panel, entries)
    local list = Instance.new("Frame")
    list.Size = UDim2.new(1, -44, 1, -100)
    list.Position = UDim2.fromOffset(22, 82)
    list.BackgroundTransparency = 1
    list.Parent = panel
    local layout = Instance.new("UIListLayout")
    layout.Padding = UDim.new(0, 10)
    layout.Parent = list
    for _, entry in ipairs(entries) do
        local item = button(list, entry)
        item.Size = UDim2.new(1, 0, 0, 54)
        item.TextXAlignment = Enum.TextXAlignment.Left
        item.Text = "   " .. entry
    end
end

addPageList(shopPage, {"INFANTERIE        100 argent", "BLINDES           500 argent", "AVIATION          1200 argent", "USINE AVANCEE     2000 argent"})
addPageList(marketPage, {"Offres des commandants", "Vendre des ressources", "Historique des transactions"})
addPageList(clanPage, {"Membres du clan", "Missions de clan", "Chat de faction"})
addPageList(rankingPage, {"Classement mondial", "Puissance militaire", "Prestige des commandants"})

local missionList = Instance.new("Frame")
missionList.Size = UDim2.new(1, -44, 1, -100)
missionList.Position = UDim2.fromOffset(22, 82)
missionList.BackgroundTransparency = 1
missionList.Parent = missionsPage
local missionLayout = Instance.new("UIListLayout")
missionLayout.Padding = UDim.new(0, 8)
missionLayout.Parent = missionList
for index = 1, Config.MissionCount do
    local mission = button(missionList, string.format("SECTEUR %02d     Mission de campagne", index))
    mission.Size = UDim2.new(1, 0, 0, 42)
    mission.MouseButton1Click:Connect(function()
        completeMission:FireServer(index)
    end)
end

local adminButton
if Config.IsAdmin(player) then
    adminButton = button(navigation, "ADMIN + INFINI")
    adminButton.Size = UDim2.new(1, 0, 0, 42)
    adminButton.BackgroundColor3 = colors.Amber
    adminButton.TextColor3 = colors.Ink
    adminButton.MouseButton1Click:Connect(function()
        adminCommand:FireServer("infinite", player.UserId)
    end)
end

local navNames = {
    {"CARTE", "Map"}, {"BOUTIQUE", "Shop"}, {"MARCHE", "Market"},
    {"MISSIONS", "Missions"}, {"CLAN", "Clan"}, {"CLASSEMENT", "Ranking"},
}
for _, data in ipairs(navNames) do
    local nav = button(navigation, data[1])
    nav.Size = UDim2.new(1, 0, 0, 42)
    nav.MouseButton1Click:Connect(function()
        for _, object in pairs(pageObjects) do object.Visible = false end
        pageObjects[data[2]].Visible = true
    end)
end

local function refresh()
    local profile = getProfile:InvokeServer()
    if not profile then return end
    statLabels.ARGENT.Text = string.format("ARGENT  %d", profile.Money)
    statLabels.GEMMES.Text = string.format("GEMMES  %d", profile.Gems)
    statLabels.POPULATION.Text = string.format("POP  %d", profile.Population)
    statLabels.NIVEAU.Text = string.format("NIVEAU  %d", profile.CommanderLevel)
end

pageObjects.Map.Visible = true
refresh()
task.spawn(function()
    while task.wait(10) do refresh() end
end)
