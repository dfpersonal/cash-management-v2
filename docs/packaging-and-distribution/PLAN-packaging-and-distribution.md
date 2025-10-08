# Plan 3: Packaging & Distribution Implementation Plan

## Overview

Create professional, self-contained installation packages that bundle all components (Electron app, Python reporter, JavaScript scrapers, database schema) into single installers for Windows, macOS, and Linux. Implement auto-update system and first-run setup experience.

**Duration**: 8 weeks  
**Dependencies**: Plans 1 & 2 must be complete (requires integrated system with path configuration)  
**Deliverables**: Professional installation packages with auto-update capability

## Phase 1: Python Reporter Standalone Bundling (Weeks 1-2)

### 1.1 Create Standalone Python Executable

**Use PyInstaller for cross-platform bundling:**
```bash
# portfolio-reporter/scripts/build-standalone.py
import os
import sys
import subprocess
import platform
from pathlib import Path

def build_standalone_reporter():
    """Build standalone executable for current platform."""
    
    # Get platform info
    current_platform = platform.system().lower()
    architecture = platform.machine().lower()
    
    # Define output names
    executable_names = {
        'windows': 'portfolio-reporter.exe',
        'darwin': 'portfolio-reporter',
        'linux': 'portfolio-reporter'
    }
    
    executable_name = executable_names.get(current_platform, 'portfolio-reporter')
    
    # PyInstaller command
    cmd = [
        'pyinstaller',
        '--name', executable_name.replace('.exe', ''),
        '--onefile',
        '--clean',
        '--noconfirm',
        
        # Include data files
        '--add-data', 'src/portfolio_reporter/templates:templates',
        '--add-data', 'config:config',
        
        # Include hidden imports
        '--hidden-import', 'portfolio_reporter',
        '--hidden-import', 'sqlite3',
        '--hidden-import', 'jinja2',
        '--hidden-import', 'click',
        
        # Optimize
        '--optimize', '2',
        
        # Entry point
        'scripts/generate_report.py'
    ]
    
    # Platform-specific adjustments
    if current_platform == 'windows':
        cmd.extend(['--console'])  # Keep console for debugging
    elif current_platform == 'darwin':
        # macOS specific optimizations
        cmd.extend(['--target-arch', 'universal2'])  # Universal binary
    
    print(f"Building standalone reporter for {current_platform}...")
    print(f"Command: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print("Build successful!")
        print(result.stdout)
        
        # Move executable to distribution directory
        dist_dir = Path('dist')
        target_dir = Path('../components/reporter/dist') / current_platform
        target_dir.mkdir(parents=True, exist_ok=True)
        
        executable_path = dist_dir / executable_name
        target_path = target_dir / executable_name
        
        if executable_path.exists():
            executable_path.rename(target_path)
            print(f"Executable moved to: {target_path}")
            
            # Make executable on Unix systems
            if current_platform in ['darwin', 'linux']:
                os.chmod(target_path, 0o755)
                
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"Build failed: {e}")
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        return False

def create_spec_file():
    """Create advanced PyInstaller spec file for customization."""
    
    spec_content = """
# -*- mode: python ; coding: utf-8 -*-

import os
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path('src').resolve()))

a = Analysis(
    ['scripts/generate_report.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('src/portfolio_reporter/templates', 'templates'),
        ('config', 'config'),
    ],
    hiddenimports=[
        'portfolio_reporter',
        'portfolio_reporter.core.generator',
        'portfolio_reporter.core.database',
        'portfolio_reporter.sections.executive_summary',
        'portfolio_reporter.sections.strategic_allocation',
        'portfolio_reporter.sections.optimization',
        'portfolio_reporter.sections.risk_assessment',
        'sqlite3',
        'jinja2',
        'click',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',  # Exclude unless actually used
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
    optimize=2,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='portfolio-reporter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
"""
    
    with open('portfolio-reporter.spec', 'w') as f:
        f.write(spec_content)
    
    print("Created advanced spec file: portfolio-reporter.spec")

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--create-spec':
        create_spec_file()
    else:
        success = build_standalone_reporter()
        sys.exit(0 if success else 1)
```

### 1.2 Cross-Platform Build Scripts

**Create platform-specific build scripts:**
```bash
# portfolio-reporter/scripts/build-all-platforms.sh
#!/bin/bash

# Build standalone reporter for all platforms
set -e

echo "Building Portfolio Reporter for all platforms..."

# macOS (run on macOS machine)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Building for macOS..."
    python scripts/build-standalone.py
    
    # Create universal binary for both Intel and Apple Silicon
    if command -v lipo >/dev/null 2>&1; then
        echo "Creating universal binary..."
        # This would require separate Intel and ARM builds
    fi
fi

# Linux (run on Linux machine or via Docker)
if [[ "$OSTYPE" == "linux"* ]]; then
    echo "Building for Linux..."
    python scripts/build-standalone.py
fi

# Windows (run on Windows machine or via Wine)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    echo "Building for Windows..."
    python scripts/build-standalone.py
fi

echo "Build complete. Executables are in ../components/reporter/dist/"
```

**Automated CI/CD build configuration:**
```yaml
# .github/workflows/build-reporter.yml
name: Build Reporter Executables

on:
  push:
    branches: [ main ]
    paths: [ 'portfolio-reporter/**' ]
  pull_request:
    branches: [ main ]
    paths: [ 'portfolio-reporter/**' ]

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    - name: Install dependencies
      run: |
        cd portfolio-reporter
        pip install -r requirements.txt
        pip install pyinstaller
    - name: Build executable
      run: |
        cd portfolio-reporter
        python scripts/build-standalone.py
    - name: Upload artifact
      uses: actions/upload-artifact@v3
      with:
        name: portfolio-reporter-windows
        path: components/reporter/dist/windows/

  build-macos:
    runs-on: macos-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    - name: Install dependencies
      run: |
        cd portfolio-reporter
        pip install -r requirements.txt
        pip install pyinstaller
    - name: Build executable
      run: |
        cd portfolio-reporter
        python scripts/build-standalone.py
    - name: Upload artifact
      uses: actions/upload-artifact@v3
      with:
        name: portfolio-reporter-macos
        path: components/reporter/dist/darwin/

  build-linux:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    - name: Install dependencies
      run: |
        cd portfolio-reporter
        pip install -r requirements.txt
        pip install pyinstaller
    - name: Build executable
      run: |
        cd portfolio-reporter
        python scripts/build-standalone.py
    - name: Upload artifact
      uses: actions/upload-artifact@v3
      with:
        name: portfolio-reporter-linux
        path: components/reporter/dist/linux/
```

### 1.3 Validate Standalone Executables

**Create validation scripts:**
```bash
# portfolio-reporter/scripts/validate-executables.py
import subprocess
import sys
import os
from pathlib import Path

def validate_executable(executable_path):
    """Validate that the standalone executable works correctly."""
    
    if not os.path.exists(executable_path):
        print(f"ERROR: Executable not found: {executable_path}")
        return False
    
    print(f"Validating: {executable_path}")
    
    # Test 1: Check help output
    try:
        result = subprocess.run([executable_path, '--help'], 
                              capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"ERROR: Help command failed with code {result.returncode}")
            return False
        
        if 'Portfolio Report Generator' not in result.stdout:
            print("ERROR: Help output doesn't contain expected text")
            return False
        
        print("✓ Help command works")
        
    except subprocess.TimeoutExpired:
        print("ERROR: Help command timed out")
        return False
    except Exception as e:
        print(f"ERROR: Help command failed: {e}")
        return False
    
    # Test 2: Check validate command
    try:
        result = subprocess.run([executable_path, 'validate'], 
                              capture_output=True, text=True, timeout=30)
        # Validate command may fail due to missing database, but should not crash
        if 'Configuration' not in result.stdout and 'Database' not in result.stdout:
            print("WARNING: Validate command output unexpected")
        
        print("✓ Validate command works")
        
    except subprocess.TimeoutExpired:
        print("ERROR: Validate command timed out")
        return False
    except Exception as e:
        print(f"ERROR: Validate command failed: {e}")
        return False
    
    print("✓ Executable validation successful")
    return True

def main():
    """Validate all platform executables."""
    
    base_dir = Path('../components/reporter/dist')
    platforms = ['windows', 'darwin', 'linux']
    executables = {
        'windows': 'portfolio-reporter.exe',
        'darwin': 'portfolio-reporter',
        'linux': 'portfolio-reporter'
    }
    
    all_valid = True
    
    for platform in platforms:
        executable_path = base_dir / platform / executables[platform]
        
        if not executable_path.exists():
            print(f"SKIP: {platform} executable not found (may not be built on this platform)")
            continue
        
        if not validate_executable(str(executable_path)):
            all_valid = False
    
    if all_valid:
        print("\n✓ All available executables validated successfully")
        return 0
    else:
        print("\n✗ Some executable validations failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())
```

## Phase 2: Enhanced Electron Builder Configuration (Week 3)

### 2.1 Advanced Electron Builder Setup

**Reference**: Section 6.1 of the path configuration specification for directory structure

**Enhanced package.json build configuration:**
```json
{
  "build": {
    "appId": "com.portfolio.cash-management",
    "productName": "Cash Management Desktop",
    "artifactName": "${productName}-${version}-${platform}-${arch}.${ext}",
    "directories": {
      "output": "release",
      "buildResources": "build-resources"
    },
    "files": [
      "dist/**/*",
      "node_modules/**/*",
      "package.json"
    ],
    "extraResources": [
      {
        "from": "../components/scrapers",
        "to": "components/scrapers",
        "filter": [
          "**/*",
          "!node_modules",
          "!*.log",
          "!*.tmp"
        ]
      },
      {
        "from": "../components/reporter/dist/${os}",
        "to": "components/reporter"
      },
      {
        "from": "../components/database",
        "to": "components/database"
      },
      {
        "from": "../config",
        "to": "config"
      },
      {
        "from": "../docs/user-guides",
        "to": "docs"
      }
    ],
    "mac": {
      "category": "public.app-category.finance",
      "target": [
        {
          "target": "dmg",
          "arch": ["x64", "arm64"]
        }
      ],
      "icon": "build-resources/icon.icns",
      "entitlements": "build-resources/entitlements.mac.plist",
      "entitlementsInherit": "build-resources/entitlements.mac.plist",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "notarize": {
        "teamId": "YOUR_TEAM_ID"
      }
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "icon": "build-resources/icon.ico",
      "requestedExecutionLevel": "asInvoker",
      "certificateSubjectName": "Your Company Name"
    },
    "linux": {
      "target": [
        {
          "target": "AppImage",
          "arch": ["x64"]
        },
        {
          "target": "deb",
          "arch": ["x64"]
        }
      ],
      "icon": "build-resources/icon.png",
      "category": "Office",
      "desktop": {
        "Name": "Cash Management Desktop",
        "Comment": "Professional cash portfolio management",
        "Categories": "Office;Finance;",
        "Keywords": "finance;portfolio;cash;savings;"
      }
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "allowElevation": true,
      "createDesktopShortcut": "always",
      "createStartMenuShortcut": true,
      "installerIcon": "build-resources/installer.ico",
      "uninstallerIcon": "build-resources/uninstaller.ico",
      "installerHeader": "build-resources/installer-header.bmp",
      "installerSidebar": "build-resources/installer-sidebar.bmp",
      "uninstallerSidebar": "build-resources/installer-sidebar.bmp",
      "license": "LICENSE.txt",
      "artifactName": "${productName}-Setup-${version}.${ext}",
      "deleteAppDataOnUninstall": false,
      "include": "build-resources/installer.nsh"
    },
    "dmg": {
      "background": "build-resources/dmg-background.png",
      "icon": "build-resources/icon.icns",
      "iconSize": 80,
      "window": {
        "width": 540,
        "height": 380
      },
      "contents": [
        {
          "x": 130,
          "y": 220
        },
        {
          "x": 410,
          "y": 220,
          "type": "link",
          "path": "/Applications"
        }
      ]
    },
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "cash-management"
    }
  }
}
```

### 2.2 Installation Scripts and First-Run Setup

**Reference**: Sections 6.1-6.3 of the path configuration specification

**Create first-run setup service:**
```typescript
// src/main/services/FirstRunSetup.ts
export class FirstRunSetup {
  private configService: ConfigurationService;
  
  constructor() {
    this.configService = new ConfigurationService();
  }
  
  async needsFirstRunSetup(): Promise<boolean> {
    try {
      await this.configService.loadConfiguration();
      return false; // Configuration exists
    } catch (error) {
      return error.code === 'ENOENT'; // Configuration doesn't exist
    }
  }
  
  async initializeApplication(): Promise<FirstRunResult> {
    try {
      await this.createDirectoryStructure();
      await this.initializeDefaultConfiguration();
      await this.copyInitialResources();
      await this.initializeDatabase();
      
      return {
        success: true,
        message: 'Application initialized successfully'
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        step: this.getCurrentStep(error)
      };
    }
  }
  
  private async createDirectoryStructure(): Promise<void> {
    const userDataDir = app.getPath('userData');
    
    const directories = [
      'data/database',
      'data/logs',
      'data/reports',
      'data/backups',
      'data/scraped-data',
      'config'
    ];
    
    for (const dir of directories) {
      const fullPath = path.join(userDataDir, dir);
      await fs.ensureDir(fullPath);
      console.log(`Created directory: ${fullPath}`);
    }
  }
  
  private async initializeDefaultConfiguration(): Promise<void> {
    const userDataDir = app.getPath('userData');
    
    // Create default path configuration
    const defaultPaths: UserDataPaths = {
      database: path.join(userDataDir, 'data', 'database', 'cash_savings.db'),
      scraperOutput: path.join(userDataDir, 'data', 'scraped-data'),
      reportsOutput: path.join(userDataDir, 'data', 'reports'),
      backups: path.join(userDataDir, 'data', 'backups'),
      logs: path.join(userDataDir, 'data', 'logs')
    };
    
    const config: PathConfiguration = {
      version: '1.0.0',
      userPaths: defaultPaths,
      systemPaths: this.resolveSystemPaths(),
      pathSettings: {
        autoCreateDirectories: true,
        validateOnStartup: true,
        backupOnPathChange: true
      },
      metadata: {
        lastModified: new Date().toISOString(),
        modifiedBy: 'first-run-setup'
      }
    };
    
    await this.configService.saveConfiguration(config);
  }
  
  private async copyInitialResources(): Promise<void> {
    const resourcesPath = process.resourcesPath;
    const userDataDir = app.getPath('userData');
    
    // Copy database schema
    const schemaSource = path.join(resourcesPath, 'components', 'database', 'schema');
    const schemaTarget = path.join(userDataDir, 'config', 'database-schema');
    
    if (await fs.pathExists(schemaSource)) {
      await fs.copy(schemaSource, schemaTarget);
    }
    
    // Copy default configuration templates
    const configSource = path.join(resourcesPath, 'config');
    const configTarget = path.join(userDataDir, 'config', 'templates');
    
    if (await fs.pathExists(configSource)) {
      await fs.copy(configSource, configTarget);
    }
  }
  
  private async initializeDatabase(): Promise<void> {
    const config = await this.configService.loadConfiguration();
    const databasePath = config.userPaths.database;
    
    // Ensure database directory exists
    await fs.ensureDir(path.dirname(databasePath));
    
    // Create database if it doesn't exist
    if (!await fs.pathExists(databasePath)) {
      const dbService = new DatabaseConnectionService();
      const result = await dbService.createNewDatabase(databasePath);
      
      if (!result.success) {
        throw new Error(`Database initialization failed: ${result.error}`);
      }
    }
  }
  
  private resolveSystemPaths(): SystemPaths {
    const resourcesPath = process.resourcesPath;
    const platform = process.platform;
    
    const reporterExecutable = platform === 'win32' 
      ? 'portfolio-reporter.exe' 
      : 'portfolio-reporter';
    
    return {
      pythonReporter: path.join(resourcesPath, 'components', 'reporter', reporterExecutable),
      scrapers: path.join(resourcesPath, 'components', 'scrapers'),
      nodeModules: path.join(resourcesPath, 'components', 'scrapers', 'node_modules'),
      templates: path.join(resourcesPath, 'components', 'reporter', 'templates'),
      documentation: path.join(resourcesPath, 'docs')
    };
  }
  
  private getCurrentStep(error: Error): string {
    const stack = error.stack || '';
    
    if (stack.includes('createDirectoryStructure')) return 'directory-creation';
    if (stack.includes('initializeDefaultConfiguration')) return 'configuration-setup';
    if (stack.includes('copyInitialResources')) return 'resource-copying';
    if (stack.includes('initializeDatabase')) return 'database-initialization';
    
    return 'unknown';
  }
  
  async validateInstallation(): Promise<InstallationValidationResult> {
    const checks: ValidationCheck[] = [];
    
    // Check configuration
    try {
      await this.configService.loadConfiguration();
      checks.push({ name: 'Configuration', passed: true, critical: true });
    } catch (error) {
      checks.push({ 
        name: 'Configuration', 
        passed: false, 
        critical: true, 
        error: error.message 
      });
    }
    
    // Check system paths
    const config = await this.configService.loadConfiguration();
    for (const [name, systemPath] of Object.entries(config.systemPaths)) {
      const exists = await fs.pathExists(systemPath);
      checks.push({
        name: `System Path: ${name}`,
        passed: exists,
        critical: name === 'pythonReporter',
        error: exists ? undefined : `Path not found: ${systemPath}`
      });
    }
    
    // Check user directories
    for (const [name, userPath] of Object.entries(config.userPaths)) {
      if (name === 'database') {
        // Check database directory exists
        const dbDir = path.dirname(userPath);
        const exists = await fs.pathExists(dbDir);
        checks.push({
          name: `Database Directory`,
          passed: exists,
          critical: true,
          error: exists ? undefined : `Directory not found: ${dbDir}`
        });
      } else {
        // Check other directories
        const exists = await fs.pathExists(userPath);
        checks.push({
          name: `User Directory: ${name}`,
          passed: exists,
          critical: false,
          error: exists ? undefined : `Directory not found: ${userPath}`
        });
      }
    }
    
    const allPassed = checks.every(check => check.passed);
    const criticalFailures = checks.filter(check => !check.passed && check.critical);
    
    return {
      allPassed,
      checks,
      criticalFailures
    };
  }
}

interface FirstRunResult {
  success: boolean;
  message?: string;
  error?: string;
  step?: string;
}

interface ValidationCheck {
  name: string;
  passed: boolean;
  critical: boolean;
  error?: string;
  suggestion?: string;
}

interface InstallationValidationResult {
  allPassed: boolean;
  checks: ValidationCheck[];
  criticalFailures: ValidationCheck[];
}
```

### 2.3 Platform-Specific Installation Enhancements

**Windows NSIS installer script:**
```nsis
; build-resources/installer.nsh
; Advanced NSIS installer customization

!include "MUI2.nsh"
!include "FileFunc.nsh"

; Custom installation steps
Function .onInstSuccess
  ; Create application data directories
  CreateDirectory "$APPDATA\cash-management"
  
  ; Set permissions for application data
  AccessControl::GrantOnFile "$APPDATA\cash-management" "(S-1-5-32-545)" "FullAccess"
  
  ; Register file associations if needed
  WriteRegStr HKCR ".cmdb" "" "CashManagementDatabase"
  WriteRegStr HKCR "CashManagementDatabase" "" "Cash Management Database"
  WriteRegStr HKCR "CashManagementDatabase\shell\open\command" "" '"$INSTDIR\Cash Management Desktop.exe" "%1"'
FunctionEnd

Function .onUninstSuccess
  ; Clean up application data (ask user)
  MessageBox MB_YESNO "Remove application data and configuration?" IDNO +3
  RMDir /r "$APPDATA\cash-management"
  DeleteRegKey HKCR ".cmdb"
FunctionEnd

; Custom pages
Page custom PreInstallPage
Page custom PostInstallPage

Function PreInstallPage
  ; Show custom pre-installation page
  nsDialogs::Create 1018
  ${NSD_CreateLabel} 0 0 100% 50% "Cash Management Desktop will be installed with the following components:$\r$\n$\r$\n• Portfolio Management Application$\r$\n• Market Data Scrapers$\r$\n• Report Generator$\r$\n• Database System$\r$\n$\r$\nTotal installation size: approximately 150 MB"
  nsDialogs::Show
FunctionEnd

Function PostInstallPage
  ; Show post-installation instructions
  nsDialogs::Create 1018
  ${NSD_CreateLabel} 0 0 100% 50% "Installation completed successfully!$\r$\n$\r$\nThe application will guide you through initial setup on first launch.$\r$\n$\r$\nClick Finish to complete the installation."
  nsDialogs::Show
FunctionEnd
```

**macOS entitlements file:**
```xml
<!-- build-resources/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
  <key>com.apple.security.files.downloads.read-write</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.automation.apple-events</key>
  <true/>
</dict>
</plist>
```

**Linux desktop file:**
```ini
# build-resources/cash-management.desktop
[Desktop Entry]
Name=Cash Management Desktop
Comment=Professional cash portfolio management system
Exec=/opt/cash-management/cash-management-desktop %F
Icon=cash-management
Type=Application
Categories=Office;Finance;
Keywords=finance;portfolio;cash;savings;investment;
StartupNotify=true
MimeType=application/x-cash-management-database;
```

## Phase 3: Auto-Update System (Week 4)

### 3.1 Implement Auto-Updater Service

**Create UpdateManager:**
```typescript
// src/main/services/UpdateManager.ts
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';

export class UpdateManager {
  private updateInfo: UpdateInfo | null = null;
  private isCheckingForUpdates = false;
  private updateDownloaded = false;
  
  constructor() {
    this.configureAutoUpdater();
    this.setupEventHandlers();
  }
  
  private configureAutoUpdater(): void {
    // Configure update server
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'your-username',
      repo: 'cash-management',
      private: false
    });
    
    // Configure auto-updater settings
    autoUpdater.autoDownload = false; // Manual download confirmation
    autoUpdater.autoInstallOnAppQuit = true;
    
    // Set update check interval (24 hours)
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => {
      this.checkForUpdates(false); // Silent check
    }, 24 * 60 * 60 * 1000);
  }
  
  private setupEventHandlers(): void {
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for update...');
      this.sendToRenderer('update:checking');
    });
    
    autoUpdater.on('update-available', (updateInfo) => {
      console.log('Update available:', updateInfo);
      this.updateInfo = updateInfo;
      this.sendToRenderer('update:available', updateInfo);
      this.showUpdateDialog(updateInfo);
    });
    
    autoUpdater.on('update-not-available', (updateInfo) => {
      console.log('Update not available:', updateInfo);
      this.sendToRenderer('update:not-available', updateInfo);
      
      if (this.isCheckingForUpdates) {
        this.showNoUpdateDialog();
      }
    });
    
    autoUpdater.on('error', (error) => {
      console.error('Update error:', error);
      this.sendToRenderer('update:error', error.message);
      
      if (this.isCheckingForUpdates) {
        this.showUpdateErrorDialog(error);
      }
    });
    
    autoUpdater.on('download-progress', (progressObj) => {
      console.log('Download progress:', progressObj);
      this.sendToRenderer('update:download-progress', progressObj);
    });
    
    autoUpdater.on('update-downloaded', (updateInfo) => {
      console.log('Update downloaded:', updateInfo);
      this.updateDownloaded = true;
      this.sendToRenderer('update:downloaded', updateInfo);
      this.showInstallDialog(updateInfo);
    });
  }
  
  async checkForUpdates(userInitiated: boolean = true): Promise<UpdateCheckResult> {
    if (this.isCheckingForUpdates) {
      return { success: false, error: 'Update check already in progress' };
    }
    
    this.isCheckingForUpdates = userInitiated;
    
    try {
      const updateCheckResult = await autoUpdater.checkForUpdates();
      
      return {
        success: true,
        updateInfo: updateCheckResult?.updateInfo,
        hasUpdate: updateCheckResult !== null
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.isCheckingForUpdates = false;
    }
  }
  
  async downloadUpdate(): Promise<DownloadUpdateResult> {
    if (!this.updateInfo) {
      return { success: false, error: 'No update available to download' };
    }
    
    try {
      await autoUpdater.downloadUpdate();
      return { success: true, message: 'Update download started' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  async installUpdate(): Promise<void> {
    if (!this.updateDownloaded) {
      throw new Error('No update downloaded');
    }
    
    // This will quit and restart the app
    autoUpdater.quitAndInstall();
  }
  
  private showUpdateDialog(updateInfo: any): void {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;
    
    dialog.showMessageBox(window, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${updateInfo.version} is available`,
      detail: `You are currently using version ${app.getVersion()}. Would you like to download the update?`,
      buttons: ['Download', 'Not Now', 'View Release Notes'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        this.downloadUpdate();
      } else if (result.response === 2) {
        shell.openExternal(updateInfo.releaseNotes);
      }
    });
  }
  
  private showInstallDialog(updateInfo: any): void {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;
    
    dialog.showMessageBox(window, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${updateInfo.version} has been downloaded`,
      detail: 'The update will be installed when you restart the application. Restart now?',
      buttons: ['Restart Now', 'Restart Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        this.installUpdate();
      }
    });
  }
  
  private showNoUpdateDialog(): void {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;
    
    dialog.showMessageBox(window, {
      type: 'info',
      title: 'No Updates Available',
      message: 'You are running the latest version',
      detail: `Current version: ${app.getVersion()}`,
      buttons: ['OK']
    });
  }
  
  private showUpdateErrorDialog(error: Error): void {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;
    
    dialog.showMessageBox(window, {
      type: 'error',
      title: 'Update Check Failed',
      message: 'Failed to check for updates',
      detail: error.message,
      buttons: ['OK']
    });
  }
  
  private sendToRenderer(channel: string, data?: any): void {
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send(channel, data);
    });
  }
}

interface UpdateCheckResult {
  success: boolean;
  updateInfo?: any;
  hasUpdate?: boolean;
  error?: string;
}

interface DownloadUpdateResult {
  success: boolean;
  message?: string;
  error?: string;
}
```

### 3.2 Add Update IPC Handlers

**Extend main.ts with update handlers:**
```typescript
// src/main/main.ts - Add update IPC handlers
import { UpdateManager } from './services/UpdateManager.js';

let updateManager: UpdateManager;

app.whenReady().then(async () => {
  // ... existing bootstrap code ...
  
  // Initialize update manager
  updateManager = new UpdateManager();
  
  // ... register other IPC handlers ...
  registerUpdateHandlers();
});

function registerUpdateHandlers(): void {
  ipcMain.handle('update:check', async (event, userInitiated = true) => {
    return updateManager.checkForUpdates(userInitiated);
  });
  
  ipcMain.handle('update:download', async () => {
    return updateManager.downloadUpdate();
  });
  
  ipcMain.handle('update:install', async () => {
    return updateManager.installUpdate();
  });
  
  ipcMain.handle('update:getStatus', async () => {
    return updateManager.getUpdateStatus();
  });
}
```

### 3.3 Update UI Components

**Create UpdateNotification component:**
```typescript
// src/renderer/components/system/UpdateNotification.tsx
interface UpdateNotificationProps {
  updateInfo: UpdateInfo | null;
  onAction: (action: UpdateAction) => void;
}

type UpdateAction = 'download' | 'install' | 'dismiss';

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  updateInfo,
  onAction
}) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  
  useEffect(() => {
    // Listen for download progress
    const handleProgress = (progress: any) => {
      setDownloadProgress(progress.percent);
    };
    
    window.electronAPI.onUpdateDownloadProgress(handleProgress);
    
    return () => {
      window.electronAPI.removeUpdateDownloadProgressListener(handleProgress);
    };
  }, []);
  
  if (!updateInfo) return null;
  
  return (
    <Snackbar
      open={true}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{ mt: 8 }}
    >
      <Alert
        severity="info"
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            {updateInfo.status === 'available' && (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  setDownloading(true);
                  onAction('download');
                }}
                disabled={downloading}
              >
                {downloading ? 'Downloading...' : 'Download'}
              </Button>
            )}
            
            {updateInfo.status === 'downloaded' && (
              <Button
                color="inherit"
                size="small"
                onClick={() => onAction('install')}
                variant="contained"
              >
                Install & Restart
              </Button>
            )}
            
            <IconButton
              size="small"
              color="inherit"
              onClick={() => onAction('dismiss')}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        }
      >
        <AlertTitle>Update Available</AlertTitle>
        Version {updateInfo.version} is available.
        
        {downloading && (
          <Box sx={{ mt: 1 }}>
            <LinearProgress variant="determinate" value={downloadProgress} />
            <Typography variant="caption">
              Downloading... {Math.round(downloadProgress)}%
            </Typography>
          </Box>
        )}
      </Alert>
    </Snackbar>
  );
};
```

## Phase 4: Component Update System (Week 5)

### 4.1 Create Component Updater Service

**Implement ComponentUpdater:**
```typescript
// src/main/services/ComponentUpdater.ts
export class ComponentUpdater {
  private configService: ConfigurationService;
  
  constructor(configService: ConfigurationService) {
    this.configService = configService;
  }
  
  async checkComponentVersions(): Promise<ComponentVersions> {
    const config = await this.configService.loadConfiguration();
    const versions: ComponentVersions = {
      app: process.env.npm_package_version || '1.0.0',
      reporter: await this.getReporterVersion(),
      scrapers: await this.getScrapersVersion(),
      database: await this.getDatabaseVersion()
    };
    
    return versions;
  }
  
  async updateReporter(): Promise<UpdateResult> {
    try {
      // Download latest reporter executable for current platform
      const platform = process.platform;
      const reporterUrl = await this.getLatestReporterUrl(platform);
      
      if (!reporterUrl) {
        return {
          success: false,
          error: 'No reporter update available for current platform'
        };
      }
      
      // Download and replace executable
      const config = await this.configService.loadConfiguration();
      const reporterPath = config.systemPaths.pythonReporter;
      
      // Create backup
      const backupPath = `${reporterPath}.backup`;
      await fs.copy(reporterPath, backupPath);
      
      try {
        // Download new version
        await this.downloadFile(reporterUrl, reporterPath);
        
        // Validate new executable
        const validation = await this.validateReporterExecutable(reporterPath);
        if (!validation.valid) {
          // Restore backup
          await fs.copy(backupPath, reporterPath);
          return {
            success: false,
            error: `Reporter validation failed: ${validation.error}`
          };
        }
        
        // Remove backup
        await fs.remove(backupPath);
        
        return {
          success: true,
          message: 'Reporter updated successfully',
          newVersion: await this.getReporterVersion()
        };
        
      } catch (error) {
        // Restore backup on failure
        if (await fs.pathExists(backupPath)) {
          await fs.copy(backupPath, reporterPath);
        }
        throw error;
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  async updateScraper(scraperName: string): Promise<UpdateResult> {
    try {
      const config = await this.configService.loadConfiguration();
      const scrapersPath = config.systemPaths.scrapers;
      const scraperPath = path.join(scrapersPath, 'src', `${scraperName}-scraper.js`);
      
      // Check if scraper exists
      if (!await fs.pathExists(scraperPath)) {
        return {
          success: false,
          error: `Scraper not found: ${scraperName}`
        };
      }
      
      // Download latest version
      const scraperUrl = await this.getLatestScraperUrl(scraperName);
      if (!scraperUrl) {
        return {
          success: false,
          error: `No update available for scraper: ${scraperName}`
        };
      }
      
      // Create backup
      const backupPath = `${scraperPath}.backup`;
      await fs.copy(scraperPath, backupPath);
      
      try {
        // Download and validate
        await this.downloadFile(scraperUrl, scraperPath);
        
        const validation = await this.validateScraperFile(scraperPath);
        if (!validation.valid) {
          await fs.copy(backupPath, scraperPath);
          return {
            success: false,
            error: `Scraper validation failed: ${validation.error}`
          };
        }
        
        await fs.remove(backupPath);
        
        return {
          success: true,
          message: `Scraper ${scraperName} updated successfully`
        };
        
      } catch (error) {
        if (await fs.pathExists(backupPath)) {
          await fs.copy(backupPath, scraperPath);
        }
        throw error;
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  async updateDatabase(): Promise<UpdateResult> {
    try {
      // Check for database schema updates
      const currentVersion = await this.getDatabaseVersion();
      const latestVersion = await this.getLatestDatabaseVersion();
      
      if (currentVersion === latestVersion) {
        return {
          success: true,
          message: 'Database is already up to date'
        };
      }
      
      // Run database migration
      const migrationService = new DatabaseMigration();
      const migrationResult = await migrationService.migrateDatabase(
        currentVersion,
        latestVersion
      );
      
      if (!migrationResult.success) {
        return {
          success: false,
          error: `Database migration failed: ${migrationResult.error}`
        };
      }
      
      return {
        success: true,
        message: 'Database updated successfully',
        newVersion: latestVersion,
        changes: migrationResult.changes
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  private async getReporterVersion(): Promise<string> {
    try {
      const config = await this.configService.loadConfiguration();
      const reporterPath = config.systemPaths.pythonReporter;
      
      const result = await this.executeCommand(reporterPath, ['--version']);
      return result.stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }
  
  private async getScrapersVersion(): Promise<string> {
    try {
      const config = await this.configService.loadConfiguration();
      const packagePath = path.join(config.systemPaths.scrapers, 'package.json');
      
      if (await fs.pathExists(packagePath)) {
        const packageData = await fs.readJson(packagePath);
        return packageData.version || 'unknown';
      }
      
      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }
  
  private async getDatabaseVersion(): Promise<string> {
    try {
      const config = await this.configService.loadConfiguration();
      const dbPath = config.userPaths.database;
      
      if (!await fs.pathExists(dbPath)) {
        return '0.0.0';
      }
      
      const db = new Database(dbPath);
      const result = db.prepare('SELECT version FROM schema_version ORDER BY applied_date DESC LIMIT 1').get();
      db.close();
      
      return result?.version || '0.0.0';
    } catch (error) {
      return '0.0.0';
    }
  }
  
  private async downloadFile(url: string, destinationPath: string): Promise<void> {
    // Implementation for downloading files
    // Could use fetch() or node-fetch for downloading
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(destinationPath, Buffer.from(arrayBuffer));
  }
  
  private async validateReporterExecutable(executablePath: string): Promise<ValidationResult> {
    try {
      const result = await this.executeCommand(executablePath, ['--help'], { timeout: 10000 });
      
      if (result.stdout.includes('Portfolio Report Generator')) {
        return { valid: true };
      }
      
      return { valid: false, error: 'Invalid executable output' };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
  
  private async validateScraperFile(scraperPath: string): Promise<ValidationResult> {
    try {
      // Basic syntax check for JavaScript file
      const content = await fs.readFile(scraperPath, 'utf8');
      
      // Check for required exports/functions
      if (!content.includes('module.exports') && !content.includes('export')) {
        return { valid: false, error: 'Missing module exports' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
  
  private async executeCommand(
    command: string, 
    args: string[], 
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'pipe' });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
      
      child.on('error', reject);
      
      if (options.timeout) {
        setTimeout(() => {
          child.kill();
          reject(new Error('Command timeout'));
        }, options.timeout);
      }
    });
  }
}

interface ComponentVersions {
  app: string;
  reporter: string;
  scrapers: string;
  database: string;
}

interface UpdateResult {
  success: boolean;
  message?: string;
  error?: string;
  newVersion?: string;
  changes?: string[];
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}
```

### 4.2 Add Component Update IPC Handlers

**Extend IPC handlers:**
```typescript
// src/main/main.ts - Add component update handlers
import { ComponentUpdater } from './services/ComponentUpdater.js';

let componentUpdater: ComponentUpdater;

app.whenReady().then(async () => {
  // ... existing code ...
  
  componentUpdater = new ComponentUpdater(configService);
  registerComponentUpdateHandlers();
});

function registerComponentUpdateHandlers(): void {
  ipcMain.handle('components:getVersions', async () => {
    return componentUpdater.checkComponentVersions();
  });
  
  ipcMain.handle('components:updateReporter', async () => {
    return componentUpdater.updateReporter();
  });
  
  ipcMain.handle('components:updateScraper', async (event, scraperName: string) => {
    return componentUpdater.updateScraper(scraperName);
  });
  
  ipcMain.handle('components:updateDatabase', async () => {
    return componentUpdater.updateDatabase();
  });
}
```

## Phase 5: Database Migration System (Week 6)

### 5.1 Implement Database Migration Service

**Create DatabaseMigration service:**
```typescript
// src/main/services/DatabaseMigration.ts
export class DatabaseMigration {
  private configService: ConfigurationService;
  
  constructor(configService: ConfigurationService) {
    this.configService = configService;
  }
  
  async needsMigration(): Promise<boolean> {
    const currentVersion = await this.getCurrentDatabaseVersion();
    const targetVersion = await this.getTargetDatabaseVersion();
    
    return this.compareVersions(currentVersion, targetVersion) < 0;
  }
  
  async migrateDatabase(fromVersion: string, toVersion: string): Promise<MigrationResult> {
    try {
      const config = await this.configService.loadConfiguration();
      const dbPath = config.userPaths.database;
      
      // Create backup before migration
      const backupPath = await this.createDatabaseBackup(dbPath);
      
      // Get migration scripts
      const migrationScripts = await this.getMigrationScripts(fromVersion, toVersion);
      
      if (migrationScripts.length === 0) {
        return {
          success: true,
          fromVersion,
          toVersion,
          changes: ['No migration required'],
          backupPath
        };
      }
      
      // Open database connection
      const db = new Database(dbPath);
      
      // Begin transaction
      db.exec('BEGIN TRANSACTION');
      
      const changes: string[] = [];
      
      try {
        // Execute migration scripts in order
        for (const script of migrationScripts) {
          console.log(`Executing migration: ${script.version}`);
          
          // Read and execute SQL
          const sqlContent = await fs.readFile(script.path, 'utf8');
          db.exec(sqlContent);
          
          // Record migration
          db.prepare(`
            INSERT INTO schema_version (version, applied_date, description)
            VALUES (?, CURRENT_TIMESTAMP, ?)
          `).run(script.version, script.description);
          
          changes.push(`Applied migration ${script.version}: ${script.description}`);
        }
        
        // Commit transaction
        db.exec('COMMIT');
        db.close();
        
        // Validate migration success
        const validation = await this.validateMigration(dbPath, toVersion);
        if (!validation.valid) {
          // Restore backup
          await this.restoreDatabaseBackup(backupPath, dbPath);
          return {
            success: false,
            fromVersion,
            toVersion,
            changes: [],
            error: `Migration validation failed: ${validation.error}`,
            backupPath
          };
        }
        
        return {
          success: true,
          fromVersion,
          toVersion,
          changes,
          backupPath
        };
        
      } catch (error) {
        // Rollback transaction
        db.exec('ROLLBACK');
        db.close();
        
        // Restore backup
        await this.restoreDatabaseBackup(backupPath, dbPath);
        
        throw error;
      }
      
    } catch (error) {
      return {
        success: false,
        fromVersion,
        toVersion,
        changes: [],
        error: error.message
      };
    }
  }
  
  async createDatabaseBackup(dbPath: string): Promise<string> {
    const config = await this.configService.loadConfiguration();
    const backupsDir = config.userPaths.backups;
    
    await fs.ensureDir(backupsDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `cash_savings_backup_${timestamp}.db`;
    const backupPath = path.join(backupsDir, backupFileName);
    
    await fs.copy(dbPath, backupPath);
    
    console.log(`Database backup created: ${backupPath}`);
    return backupPath;
  }
  
  private async restoreDatabaseBackup(backupPath: string, dbPath: string): Promise<void> {
    if (await fs.pathExists(backupPath)) {
      await fs.copy(backupPath, dbPath);
      console.log(`Database restored from backup: ${backupPath}`);
    }
  }
  
  private async getCurrentDatabaseVersion(): Promise<string> {
    try {
      const config = await this.configService.loadConfiguration();
      const dbPath = config.userPaths.database;
      
      if (!await fs.pathExists(dbPath)) {
        return '0.0.0';
      }
      
      const db = new Database(dbPath);
      
      // Check if schema_version table exists
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='schema_version'
      `).get();
      
      if (!tableExists) {
        db.close();
        return '1.0.0'; // Initial version before versioning system
      }
      
      const result = db.prepare(`
        SELECT version FROM schema_version 
        ORDER BY applied_date DESC 
        LIMIT 1
      `).get();
      
      db.close();
      
      return result?.version || '1.0.0';
      
    } catch (error) {
      console.error('Error getting database version:', error);
      return '0.0.0';
    }
  }
  
  private async getTargetDatabaseVersion(): Promise<string> {
    // Read target version from bundled schema info
    try {
      const schemaInfoPath = path.join(
        process.resourcesPath,
        'components',
        'database',
        'schema',
        'version.json'
      );
      
      if (await fs.pathExists(schemaInfoPath)) {
        const versionInfo = await fs.readJson(schemaInfoPath);
        return versionInfo.version;
      }
      
      // Fallback: scan migration files to find latest version
      const migrationsPath = path.join(
        process.resourcesPath,
        'components',
        'database',
        'migrations'
      );
      
      if (await fs.pathExists(migrationsPath)) {
        const files = await fs.readdir(migrationsPath);
        const migrationFiles = files
          .filter(f => f.endsWith('.sql'))
          .map(f => f.replace('.sql', ''))
          .sort((a, b) => this.compareVersions(a, b));
        
        return migrationFiles[migrationFiles.length - 1] || '2.0.0';
      }
      
      return '2.0.0'; // Default target version
      
    } catch (error) {
      console.error('Error getting target database version:', error);
      return '2.0.0';
    }
  }
  
  private async getMigrationScripts(fromVersion: string, toVersion: string): Promise<MigrationScript[]> {
    try {
      const migrationsPath = path.join(
        process.resourcesPath,
        'components',
        'database',
        'migrations'
      );
      
      if (!await fs.pathExists(migrationsPath)) {
        return [];
      }
      
      const files = await fs.readdir(migrationsPath);
      const scripts: MigrationScript[] = [];
      
      for (const file of files) {
        if (!file.endsWith('.sql')) continue;
        
        const version = file.replace('.sql', '');
        
        // Only include scripts between fromVersion and toVersion
        if (this.compareVersions(version, fromVersion) > 0 && 
            this.compareVersions(version, toVersion) <= 0) {
          
          scripts.push({
            version,
            path: path.join(migrationsPath, file),
            description: await this.getMigrationDescription(path.join(migrationsPath, file))
          });
        }
      }
      
      // Sort by version
      scripts.sort((a, b) => this.compareVersions(a.version, b.version));
      
      return scripts;
      
    } catch (error) {
      console.error('Error getting migration scripts:', error);
      return [];
    }
  }
  
  private async getMigrationDescription(scriptPath: string): Promise<string> {
    try {
      const content = await fs.readFile(scriptPath, 'utf8');
      const lines = content.split('\n');
      
      // Look for description comment at the top
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-- Description:')) {
          return trimmed.replace('-- Description:', '').trim();
        }
        if (trimmed.startsWith('/*') && trimmed.includes('Description:')) {
          return trimmed.replace(/\/\*.*Description:\s*/, '').replace(/\*\/.*/, '').trim();
        }
      }
      
      return `Migration to version ${path.basename(scriptPath, '.sql')}`;
    } catch (error) {
      return 'Database migration';
    }
  }
  
  private async validateMigration(dbPath: string, expectedVersion: string): Promise<ValidationResult> {
    try {
      const db = new Database(dbPath);
      
      // Check schema version
      const versionResult = db.prepare(`
        SELECT version FROM schema_version 
        ORDER BY applied_date DESC 
        LIMIT 1
      `).get();
      
      if (!versionResult || versionResult.version !== expectedVersion) {
        db.close();
        return {
          valid: false,
          error: `Version mismatch. Expected: ${expectedVersion}, Got: ${versionResult?.version || 'none'}`
        };
      }
      
      // Basic table structure validation
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all();
      
      const requiredTables = ['deposits', 'institutions', 'scraper_results', 'schema_version'];
      for (const requiredTable of requiredTables) {
        if (!tables.some(t => t.name === requiredTable)) {
          db.close();
          return {
            valid: false,
            error: `Missing required table: ${requiredTable}`
          };
        }
      }
      
      db.close();
      return { valid: true };
      
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
  
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart < bPart) return -1;
      if (aPart > bPart) return 1;
    }
    
    return 0;
  }
}

interface MigrationScript {
  version: string;
  path: string;
  description: string;
}

interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  changes: string[];
  backupPath?: string;
  error?: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}
```

### 5.2 Create Migration Scripts Structure

**Database migration files structure:**
```sql
-- components/database/migrations/2.0.0.sql
-- Description: Add system status tracking tables

CREATE TABLE IF NOT EXISTS system_status (
  component TEXT PRIMARY KEY,
  status TEXT NOT NULL, -- 'healthy' | 'warning' | 'error'
  last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
  details JSON,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS process_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_type TEXT NOT NULL, -- 'scraper' | 'reporter' | 'system'
  process_name TEXT NOT NULL,
  log_level TEXT NOT NULL, -- 'info' | 'warning' | 'error'
  message TEXT NOT NULL,
  details JSON,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add indices for better performance
CREATE INDEX IF NOT EXISTS idx_process_logs_timestamp ON process_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_process_logs_type ON process_logs(process_type);
CREATE INDEX IF NOT EXISTS idx_system_status_component ON system_status(component);
```

```sql
-- components/database/migrations/2.1.0.sql
-- Description: Add scheduled tasks support

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL, -- 'scraper' | 'report'
  task_name TEXT NOT NULL,
  cron_schedule TEXT NOT NULL,
  options JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_run DATETIME,
  next_run DATETIME
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_type ON scheduled_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active ON scheduled_tasks(is_active);
```

```json
{
  "version": "2.1.0",
  "description": "Database schema with system monitoring and task scheduling",
  "requiredTables": [
    "deposits",
    "institutions", 
    "scraper_results",
    "schema_version",
    "system_status",
    "process_logs",
    "scheduled_tasks"
  ],
  "migrations": [
    {
      "version": "2.0.0",
      "description": "Add system status tracking tables",
      "file": "2.0.0.sql"
    },
    {
      "version": "2.1.0", 
      "description": "Add scheduled tasks support",
      "file": "2.1.0.sql"
    }
  ]
}
```

## Phase 6: Testing & Quality Assurance (Weeks 7-8)

### 6.1 Integration Testing Framework

**Create comprehensive test suite:**
```typescript
// test/integration/packaging.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/jest';
import { Application } from 'spectron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

describe('Packaging Integration Tests', () => {
  let app: Application;
  const testDataDir = path.join(__dirname, 'test-data');
  
  beforeAll(async () => {
    // Set up test environment
    await fs.ensureDir(testDataDir);
    
    // Start application in test mode
    app = new Application({
      path: path.join(__dirname, '../../dist/Cash Management Desktop.exe'),
      args: ['--test-mode'],
      env: {
        NODE_ENV: 'test',
        TEST_DATA_DIR: testDataDir
      }
    });
    
    await app.start();
  });
  
  afterAll(async () => {
    if (app && app.isRunning()) {
      await app.stop();
    }
    
    // Clean up test data
    await fs.remove(testDataDir);
  });
  
  describe('First-Run Setup', () => {
    it('should create default directory structure', async () => {
      // Verify directories are created
      const expectedDirs = [
        'data/database',
        'data/logs', 
        'data/reports',
        'data/backups',
        'data/scraped-data'
      ];
      
      for (const dir of expectedDirs) {
        const dirPath = path.join(testDataDir, dir);
        expect(await fs.pathExists(dirPath)).toBe(true);
      }
    });
    
    it('should create default configuration', async () => {
      const configPath = path.join(testDataDir, 'config', 'config.json');
      expect(await fs.pathExists(configPath)).toBe(true);
      
      const config = await fs.readJson(configPath);
      expect(config.version).toBeDefined();
      expect(config.userPaths).toBeDefined();
      expect(config.systemPaths).toBeDefined();
    });
    
    it('should initialize database with correct schema', async () => {
      const dbPath = path.join(testDataDir, 'data', 'database', 'cash_savings.db');
      expect(await fs.pathExists(dbPath)).toBe(true);
      
      // Verify database structure
      const Database = require('better-sqlite3');
      const db = new Database(dbPath);
      
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all();
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('deposits');
      expect(tableNames).toContain('institutions');
      expect(tableNames).toContain('schema_version');
      
      db.close();
    });
  });
  
  describe('System Paths Resolution', () => {
    it('should resolve Python reporter executable', async () => {
      const systemPaths = await app.electron.ipcRenderer.invoke('pathConfig:getSystemPaths');
      
      expect(systemPaths.pythonReporter).toBeDefined();
      expect(await fs.pathExists(systemPaths.pythonReporter)).toBe(true);
      
      // Test executable runs
      const result = await new Promise((resolve, reject) => {
        const child = spawn(systemPaths.pythonReporter, ['--help']);
        let output = '';
        
        child.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        child.on('exit', (code) => {
          resolve({ code, output });
        });
        
        child.on('error', reject);
        
        setTimeout(() => {
          child.kill();
          reject(new Error('Timeout'));
        }, 10000);
      });
      
      expect(result.code).toBe(0);
      expect(result.output).toContain('Portfolio Report Generator');
    });
    
    it('should resolve scrapers directory', async () => {
      const systemPaths = await app.electron.ipcRenderer.invoke('pathConfig:getSystemPaths');
      
      expect(systemPaths.scrapers).toBeDefined();
      expect(await fs.pathExists(systemPaths.scrapers)).toBe(true);
      
      // Check for scraper files
      const scraperFiles = await fs.readdir(path.join(systemPaths.scrapers, 'src'));
      expect(scraperFiles.some(f => f.endsWith('-scraper.js'))).toBe(true);
    });
  });
  
  describe('Process Management', () => {
    it('should start and stop scrapers', async () => {
      // Start a scraper
      const result = await app.electron.ipcRenderer.invoke('system:triggerScraper', 'moneyfacts');
      expect(result.success).toBe(true);
      
      // Check process status
      const status = await app.electron.ipcRenderer.invoke('system:getProcessStatus');
      expect(status.some(p => p.name === 'moneyfacts')).toBe(true);
      
      // Wait for completion (or timeout)
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const finalStatus = await app.electron.ipcRenderer.invoke('system:getProcessStatus');
      const scraperProcess = finalStatus.find(p => p.name === 'moneyfacts');
      expect(['completed', 'error'].includes(scraperProcess?.status)).toBe(true);
    });
    
    it('should generate reports', async () => {
      const reportOptions = {
        format: 'html',
        sections: ['executive'],
        priorityFilter: [1, 2, 3, 4]
      };
      
      const result = await app.electron.ipcRenderer.invoke('system:generateReport', reportOptions);
      expect(result.success).toBe(true);
      
      // Check if report file was created
      const reportsDir = path.join(testDataDir, 'data', 'reports');
      const files = await fs.readdir(reportsDir);
      expect(files.some(f => f.endsWith('.html'))).toBe(true);
    });
  });
  
  describe('Configuration Management', () => {
    it('should update path configuration', async () => {
      const newPath = path.join(testDataDir, 'custom-reports');
      await fs.ensureDir(newPath);
      
      const result = await app.electron.ipcRenderer.invoke(
        'pathConfig:setUserPath',
        'reportsOutput',
        newPath
      );
      
      expect(result.isValid).toBe(true);
      
      // Verify configuration was saved
      const updatedPaths = await app.electron.ipcRenderer.invoke('pathConfig:getAllPaths');
      expect(updatedPaths.reportsOutput).toBe(newPath);
    });
    
    it('should validate path changes', async () => {
      const invalidPath = '/nonexistent/directory/path';
      
      const result = await app.electron.ipcRenderer.invoke(
        'pathConfig:setUserPath',
        'reportsOutput', 
        invalidPath
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
```

### 6.2 Performance Testing

**Create performance test suite:**
```typescript
// test/performance/performance.test.ts
import { describe, it, expect } from '@jest/jest';
import { performance } from 'perf_hooks';

describe('Performance Tests', () => {
  describe('Application Startup', () => {
    it('should start within 5 seconds', async () => {
      const startTime = performance.now();
      
      // Start application and wait for ready state
      const app = await startApplication();
      
      const endTime = performance.now();
      const startupTime = endTime - startTime;
      
      expect(startupTime).toBeLessThan(5000); // 5 seconds
      
      await app.stop();
    });
    
    it('should load configuration within 1 second', async () => {
      const startTime = performance.now();
      
      const configService = new ConfigurationService();
      await configService.initialize();
      
      const endTime = performance.now();
      const loadTime = endTime - startTime;
      
      expect(loadTime).toBeLessThan(1000); // 1 second
    });
  });
  
  describe('Database Operations', () => {
    it('should connect to database within 2 seconds', async () => {
      const startTime = performance.now();
      
      const dbService = new DatabaseConnectionService();
      const result = await dbService.attemptConnection('/path/to/test.db');
      
      const endTime = performance.now();
      const connectionTime = endTime - startTime;
      
      expect(connectionTime).toBeLessThan(2000); // 2 seconds
      expect(result.success).toBe(true);
    });
    
    it('should handle large datasets efficiently', async () => {
      // Create test database with 10,000 deposits
      const db = createTestDatabase();
      await populateTestData(db, 10000);
      
      const startTime = performance.now();
      
      // Query all deposits
      const deposits = db.prepare('SELECT * FROM deposits').all();
      
      const endTime = performance.now();
      const queryTime = endTime - startTime;
      
      expect(queryTime).toBeLessThan(500); // 500ms for 10k records
      expect(deposits.length).toBe(10000);
      
      db.close();
    });
  });
  
  describe('Memory Usage', () => {
    it('should maintain memory usage below 500MB', async () => {
      const app = await startApplication();
      
      // Perform various operations
      await performTypicalWorkflow(app);
      
      // Check memory usage
      const memUsage = process.memoryUsage();
      const memoryMB = memUsage.heapUsed / 1024 / 1024;
      
      expect(memoryMB).toBeLessThan(500);
      
      await app.stop();
    });
    
    it('should not have memory leaks during extended use', async () => {
      const app = await startApplication();
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Simulate extended use
      for (let i = 0; i < 100; i++) {
        await performTypicalWorkflow(app);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      
      // Memory increase should be minimal (< 50MB)
      expect(memoryIncrease).toBeLessThan(50);
      
      await app.stop();
    });
  });
});

async function performTypicalWorkflow(app: Application): Promise<void> {
  // Navigate through pages
  await app.electron.ipcRenderer.invoke('navigate', '/dashboard');
  await app.electron.ipcRenderer.invoke('navigate', '/holdings');
  await app.electron.ipcRenderer.invoke('navigate', '/system');
  
  // Trigger data operations
  await app.electron.ipcRenderer.invoke('system:getSystemStatus');
  await app.electron.ipcRenderer.invoke('pathConfig:getAllPaths');
  
  // Small delay to simulate user interaction
  await new Promise(resolve => setTimeout(resolve, 100));
}
```

### 6.3 End-to-End Testing

**Create E2E test scenarios:**
```typescript
// test/e2e/user-workflows.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/jest';
import { Application } from 'spectron';

describe('End-to-End User Workflows', () => {
  let app: Application;
  
  beforeAll(async () => {
    app = await startApplicationForTesting();
  });
  
  afterAll(async () => {
    if (app && app.isRunning()) {
      await app.stop();
    }
  });
  
  describe('New User Onboarding', () => {
    it('should complete first-run setup wizard', async () => {
      // Should show first-run wizard
      await app.client.waitUntilWindowLoaded();
      
      const wizardTitle = await app.client.$('h5=Welcome to Cash Management Desktop');
      expect(await wizardTitle.isDisplayed()).toBe(true);
      
      // Navigate through wizard steps
      const getStartedBtn = await app.client.$('button*=Get Started');
      await getStartedBtn.click();
      
      // Data location step - use defaults
      const useDefaultsCheckbox = await app.client.$('input[type="checkbox"]');
      expect(await useDefaultsCheckbox.isSelected()).toBe(true);
      
      const nextBtn = await app.client.$('button*=Next');
      await nextBtn.click();
      
      // Confirmation step
      const finishBtn = await app.client.$('button*=Complete Setup');
      await finishBtn.click();
      
      // Should navigate to dashboard
      await app.client.waitUntil(async () => {
        const url = await app.client.getUrl();
        return url.includes('/dashboard');
      });
    });
  });
  
  describe('Portfolio Management Workflow', () => {
    it('should add new deposit and view in holdings', async () => {
      // Navigate to portfolio management
      await app.client.$('a[href="/management"]').click();
      
      // Add new deposit
      const addDepositBtn = await app.client.$('button*=Add Deposit');
      await addDepositBtn.click();
      
      // Fill form
      await app.client.$('input[name="institution"]').setValue('Test Bank');
      await app.client.$('input[name="accountName"]').setValue('Test Savings');
      await app.client.$('input[name="amount"]').setValue('10000');
      await app.client.$('input[name="interestRate"]').setValue('4.5');
      
      const saveBtn = await app.client.$('button*=Save Deposit');
      await saveBtn.click();
      
      // Navigate to holdings
      await app.client.$('a[href="/holdings"]').click();
      
      // Verify deposit appears
      const depositRow = await app.client.$('td*=Test Bank');
      expect(await depositRow.isDisplayed()).toBe(true);
    });
  });
  
  describe('Report Generation Workflow', () => {
    it('should generate and view report', async () => {
      // Navigate to system control
      await app.client.$('a[href="/system"]').click();
      
      // Configure report options
      const formatSelect = await app.client.$('select[name="format"]');
      await formatSelect.selectByValue('html');
      
      // Generate report
      const generateBtn = await app.client.$('button*=Generate Report');
      await generateBtn.click();
      
      // Wait for generation to complete
      await app.client.waitUntil(async () => {
        const text = await generateBtn.getText();
        return !text.includes('Generating');
      }, 30000);
      
      // Verify success message
      const successAlert = await app.client.$('.MuiAlert-standardSuccess');
      expect(await successAlert.isDisplayed()).toBe(true);
    });
  });
  
  describe('System Configuration Workflow', () => {
    it('should update path configuration', async () => {
      // Navigate to configuration
      await app.client.$('a[href="/configuration"]').click();
      
      // Find path configuration section
      const pathSection = await app.client.$('h6*=File Locations');
      expect(await pathSection.isDisplayed()).toBe(true);
      
      // Update reports directory
      const reportsPathInput = await app.client.$('input[data-testid="reports-path"]');
      await reportsPathInput.clearValue();
      await reportsPathInput.setValue('/custom/reports/path');
      
      // Save configuration
      const saveBtn = await app.client.$('button*=Save Configuration');
      await saveBtn.click();
      
      // Verify success
      const successMessage = await app.client.$('.MuiAlert-standardSuccess');
      expect(await successMessage.isDisplayed()).toBe(true);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Simulate database error by moving database file
      await app.electron.ipcRenderer.invoke('test:simulateDatabaseError');
      
      // Navigate to dashboard - should show error state
      await app.client.$('a[href="/dashboard"]').click();
      
      const errorAlert = await app.client.$('.MuiAlert-standardError');
      expect(await errorAlert.isDisplayed()).toBe(true);
      
      const errorText = await errorAlert.getText();
      expect(errorText).toContain('database');
    });
    
    it('should recover from network errors', async () => {
      // Simulate network error
      await app.electron.ipcRenderer.invoke('test:simulateNetworkError');
      
      // Try to check for updates
      await app.client.$('button*=Check for Updates').click();
      
      // Should show error, then retry button
      const retryBtn = await app.client.$('button*=Retry');
      expect(await retryBtn.isDisplayed()).toBe(true);
      
      // Restore network and retry
      await app.electron.ipcRenderer.invoke('test:restoreNetwork');
      await retryBtn.click();
      
      // Should succeed
      await app.client.waitUntil(async () => {
        const text = await app.client.$('body').getText();
        return text.includes('up to date') || text.includes('update available');
      });
    });
  });
});
```

### 6.4 Cross-Platform Testing

**Create platform-specific test configuration:**
```yaml
# .github/workflows/cross-platform-testing.yml
name: Cross-Platform Testing

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test-windows:
    runs-on: windows-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
    - name: Install dependencies
      run: npm ci
    - name: Build application
      run: npm run build
    - name: Package for Windows
      run: npm run dist:win
    - name: Run integration tests
      run: npm run test:integration:windows
    - name: Run E2E tests
      run: npm run test:e2e:windows
      env:
        TEST_PACKAGE_PATH: './dist/Cash Management Desktop Setup.exe'

  test-macos:
    runs-on: macos-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
    - name: Install dependencies
      run: npm ci
    - name: Build application
      run: npm run build
    - name: Package for macOS
      run: npm run dist:mac
    - name: Run integration tests
      run: npm run test:integration:mac
    - name: Run E2E tests
      run: npm run test:e2e:mac
      env:
        TEST_PACKAGE_PATH: './dist/Cash Management Desktop.dmg'

  test-linux:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
    - name: Install dependencies
      run: npm ci
    - name: Install system dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y xvfb
    - name: Build application
      run: npm run build
    - name: Package for Linux
      run: npm run dist:linux
    - name: Run integration tests
      run: xvfb-run npm run test:integration:linux
    - name: Run E2E tests
      run: xvfb-run npm run test:e2e:linux
      env:
        TEST_PACKAGE_PATH: './dist/Cash Management Desktop.AppImage'
```

## Implementation Timeline & Risk Management

### Timeline Overview

**Total Duration: 8 weeks**

| Phase | Duration | Key Deliverables | Critical Dependencies |
|-------|----------|------------------|----------------------|
| Phase 1 | 2 weeks | Python reporter executables | PyInstaller setup, CI/CD |
| Phase 2 | 1 week | Electron builder config | Resource bundling strategy |
| Phase 3 | 1 week | Auto-update system | GitHub releases setup |
| Phase 4 | 1 week | Component updates | Version management |
| Phase 5 | 1 week | Database migrations | Migration script testing |
| Phase 6 | 2 weeks | Testing & QA | All previous phases complete |

### Risk Mitigation Strategies

**Technical Risks:**

1. **Python Bundling Complexity**
   - **Risk**: PyInstaller fails on specific platforms or with certain dependencies
   - **Mitigation**: Early testing on all platforms, containerized builds, fallback to separate Python installation
   - **Contingency**: Provide Python installer alongside app if standalone fails

2. **Cross-Platform Code Signing**
   - **Risk**: Certificate issues prevent installation on macOS/Windows
   - **Mitigation**: Set up proper certificates early, test signing process
   - **Contingency**: Distribute unsigned versions with clear installation instructions

3. **Auto-Update System Reliability**
   - **Risk**: Update mechanism fails, corrupts installations
   - **Mitigation**: Comprehensive backup before updates, rollback mechanism
   - **Contingency**: Manual update process documentation

4. **Database Migration Failures**
   - **Risk**: Data loss during schema updates
   - **Mitigation**: Mandatory backups, extensive testing, validation steps
   - **Contingency**: Manual data recovery procedures

**Deployment Risks:**

1. **Installation Package Size**
   - **Risk**: Large packages (>200MB) affect download/distribution
   - **Mitigation**: Optimize bundled components, remove unnecessary files
   - **Contingency**: Split into core app + downloadable components

2. **Platform Compatibility Issues**
   - **Risk**: App fails on specific OS versions or configurations
   - **Mitigation**: Test on multiple OS versions, graceful degradation
   - **Contingency**: Document minimum requirements, provide troubleshooting

3. **First-Run Setup Failures**
   - **Risk**: Users can't complete initial setup, app becomes unusable
   - **Mitigation**: Robust error handling, recovery options, clear messages
   - **Contingency**: Manual setup instructions, support documentation

### Success Metrics

**Technical Success Criteria:**

- [ ] **Installation Success Rate**: >95% successful installations across platforms
- [ ] **Startup Performance**: Application starts in <5 seconds on typical hardware  
- [ ] **Memory Usage**: Peak memory usage <500MB during normal operation
- [ ] **Update Reliability**: >99% successful auto-updates without data loss
- [ ] **Component Integration**: All bundled components (reporter, scrapers) work correctly
- [ ] **Database Migration**: 100% successful migrations with backup/recovery
- [ ] **Cross-Platform Parity**: Feature parity across Windows, macOS, Linux

**User Experience Success Criteria:**

- [ ] **Installation Simplicity**: Single-click installation process
- [ ] **First-Run Experience**: <5 minutes from installation to first report
- [ ] **Configuration Flexibility**: Users can customize all data locations
- [ ] **Error Recovery**: Clear error messages with actionable recovery steps
- [ ] **Update Experience**: Seamless updates with minimal user intervention
- [ ] **Documentation Quality**: Complete user guides with troubleshooting

**Business Success Criteria:**

- [ ] **Distribution Readiness**: Professional installers for all target platforms
- [ ] **Maintenance Efficiency**: Automated build and release pipeline
- [ ] **Support Scalability**: Self-service installation and troubleshooting
- [ ] **Version Management**: Clear versioning strategy for all components
- [ ] **User Adoption**: Easy onboarding for non-technical users

### Quality Gates

**Phase 1 Quality Gates:**
- All platform executables validate successfully
- Standalone reporter matches full functionality
- CI/CD pipeline produces consistent builds

**Phase 2 Quality Gates:**
- Installation packages install correctly on clean systems
- All bundled resources are accessible at runtime
- First-run setup completes successfully

**Phase 3 Quality Gates:**
- Auto-update mechanism tested with mock releases
- Update download and installation work without data loss
- Rollback mechanism functions correctly

**Phase 4-5 Quality Gates:**
- Component updates maintain system stability
- Database migrations preserve all data integrity
- Version compatibility matrix verified

**Phase 6 Quality Gates:**
- All integration tests pass on target platforms
- Performance benchmarks meet success criteria
- End-to-end workflows complete successfully
- Security review completed (code signing, permissions)

### Deployment Checklist

**Pre-Release Validation:**
- [ ] All components built and validated on target platforms
- [ ] Installation packages tested on clean systems
- [ ] Auto-update mechanism tested with staged releases
- [ ] Database migration tested with production-sized datasets
- [ ] Performance testing completed across hardware profiles
- [ ] Security scanning completed (dependencies, executables)
- [ ] Documentation reviewed and updated
- [ ] Support procedures documented and tested

**Release Preparation:**
- [ ] Code signing certificates configured and tested
- [ ] Release notes prepared with upgrade instructions
- [ ] Download infrastructure tested and scaled
- [ ] Support channels prepared for release
- [ ] Rollback procedures documented and tested
- [ ] Telemetry and error reporting configured

**Post-Release Monitoring:**
- [ ] Installation success rates monitored
- [ ] Auto-update adoption tracked
- [ ] Error reports triaged and addressed
- [ ] User feedback collected and categorized
- [ ] Performance metrics monitored
- [ ] Support ticket volume and resolution tracked

This comprehensive packaging and distribution plan provides a professional, self-contained solution that transforms the cash management system into an easily installable and maintainable desktop application suitable for professional use.