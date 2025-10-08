/**
 * ErrorBoundary - React error boundary for graceful error handling
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Paper, Typography, Button, Collapse, IconButton } from '@mui/material';
import { Warning as WarningIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { LogCategory } from '@cash-mgmt/shared';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      showDetails: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`${LogCategory.ERROR} React Error Boundary caught:`, error, errorInfo);
    
    // Call the error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });
    
    // Log to audit service if available
    if (window.electronAPI?.logError) {
      window.electronAPI.logError({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails,
    }));
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI
      return (
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Paper elevation={3} sx={{ p: 4, maxWidth: 600, width: '100%' }}>
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <WarningIcon color="error" sx={{ fontSize: 40 }} />
              <Typography variant="h5" color="error">
                Something went wrong
              </Typography>
            </Box>
            
            <Typography variant="body1" paragraph>
              An unexpected error occurred in the application. The error has been logged and our team will investigate.
            </Typography>
            
            {this.state.error && (
              <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#f5f5f5' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Error Message:
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 1 }}>
                  {this.state.error.message}
                </Typography>
              </Paper>
            )}
            
            <Box display="flex" gap={2} alignItems="center">
              <Button 
                variant="contained" 
                color="primary" 
                onClick={this.handleReset}
              >
                Try Again
              </Button>
              
              <Button
                variant="outlined"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
              
              {this.state.errorInfo && (
                <IconButton
                  onClick={this.toggleDetails}
                  sx={{ 
                    transform: this.state.showDetails ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s',
                    ml: 'auto'
                  }}
                >
                  <ExpandMoreIcon />
                </IconButton>
              )}
            </Box>
            
            {this.state.errorInfo && (
              <Collapse in={this.state.showDetails}>
                <Paper variant="outlined" sx={{ p: 2, mt: 2, backgroundColor: '#f5f5f5' }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Stack Trace:
                  </Typography>
                  <Typography 
                    variant="body2" 
                    component="pre" 
                    sx={{ 
                      fontFamily: 'monospace', 
                      fontSize: '0.75rem',
                      overflow: 'auto',
                      maxHeight: 300,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {this.state.error?.stack}
                    {'\n\nComponent Stack:'}
                    {this.state.errorInfo.componentStack}
                  </Typography>
                </Paper>
              </Collapse>
            )}
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  return (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );
}