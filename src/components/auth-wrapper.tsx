"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase-client"

interface AuthWrapperProps {
  children: React.ReactNode
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { toast } = useToast()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showLoginDialog, setShowLoginDialog] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  // Check auth state on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setIsAuthenticated(true)
        setShowLoginDialog(false)
      }
    }
    checkAuth()

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setIsAuthenticated(true)
        setShowLoginDialog(false)
      } else {
        setIsAuthenticated(false)
        setShowLoginDialog(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleLogin = async () => {
    if (!email || !password) {
      toast({
        variant: "destructive",
        title: "שגיאה",
        description: "נא למלא את כל השדות"
      })
      return
    }

    setIsLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        throw error
      }

      if (data.session) {
        setIsAuthenticated(true)
        setShowLoginDialog(false)
        toast({
          title: "התחברת בהצלחה",
          description: "ברוך הבא למערכת"
        })
      }
    } catch (error) {
      console.error('Login error:', error)
      toast({
        variant: "destructive",
        title: "שגיאה בהתחברות",
        description: error instanceof Error ? error.message : "אירעה שגיאה בהתחברות"
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (showLoginDialog) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
        <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg">
          <h2 className="text-lg font-semibold">התחברות למערכת</h2>
          <div className="space-y-4">
            <div>
              <Label>אימייל</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <Label>סיסמה</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <Button 
              onClick={handleLogin} 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'מתחבר...' : 'התחבר'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return children
} 