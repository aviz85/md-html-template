"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

interface AuthWrapperProps {
  children: React.ReactNode
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { toast } = useToast()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [showPasswordDialog, setShowPasswordDialog] = useState(true)

  // Check on component mount
  useEffect(() => {
    const expectedPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD
    console.log('Environment check on load:', { 
      hasPassword: !!expectedPassword,
      actualValue: expectedPassword 
    })
  }, [])

  const handlePasswordSubmit = () => {
    const expectedPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD
    
    if (!expectedPassword) {
      console.error('NEXT_PUBLIC_ADMIN_PASSWORD is not defined')
      toast({
        variant: "destructive",
        title: "שגיאה",
        description: "הסיסמה לא הוגדרה במערכת. אנא הגדר את משתנה הסביבה NEXT_PUBLIC_ADMIN_PASSWORD"
      })
      return
    }
    
    if (password === expectedPassword) {
      setIsAuthenticated(true)
      setShowPasswordDialog(false)
    } else {
      toast({
        variant: "destructive",
        title: "שגיאה",
        description: "סיסמה שגויה"
      })
    }
  }

  if (showPasswordDialog) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
        <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg">
          <h2 className="text-lg font-semibold">גישה למנהל התבניות</h2>
          <div className="space-y-4">
            <div>
              <Label>סיסמה</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              />
            </div>
            <Button onClick={handlePasswordSubmit} className="w-full">
              כניסה
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