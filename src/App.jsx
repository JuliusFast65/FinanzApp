import React, { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

import { auth, db } from './firebase';
import CreditCardManager from './components/CreditCardManager';
import PDFStatementAnalyzer from './components/PDFStatementAnalyzer';
import FinanceDashboard from './components/FinanceDashboard';
import StatementsView from './components/StatementsView';
import { APP_VERSION } from './config/version';

// Configuración del proyecto
const appId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

// --- Componente de Login ---
const LoginScreen = ({ onGoogleSignIn }) => {
    const { t } = useTranslation();
    
    return (
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-gray-900 dark:to-gray-800 min-h-screen flex flex-col items-center justify-center p-4">
            <div className="text-center flex flex-col items-center">
                <div className="mb-8">
                    <div className="w-24 h-24 md:w-32 md:h-32 mx-auto mb-6 bg-green-600 rounded-full flex items-center justify-center">
                        <svg className="w-16 h-16 md:w-20 md:h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-2">FinanzApp</h1>
                    <p className="text-gray-600 dark:text-gray-300 text-lg md:text-xl mb-2">Control Total de tus Finanzas</p>
                    <p className="text-gray-600 dark:text-gray-300 text-lg md:text-xl">Gestiona tarjetas, analiza estados de cuenta y visualiza tu salud financiera</p>
                    <span className="block mt-4 text-xs text-gray-500 dark:text-gray-400">V {APP_VERSION}</span>
                </div>
                <button
                    onClick={onGoogleSignIn}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-colors duration-300 inline-flex items-center gap-3 text-lg"
                >
                    <svg className="w-6 h-6" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                    Iniciar Sesión con Google
                </button>
            </div>
        </div>
    );
};

// --- Componente Principal de la App ---
const FinanceApp = ({ user }) => {
    const { t } = useTranslation();
    const [currentView, setCurrentView] = useState('dashboard'); // dashboard, cards, analyzer, statements
    const [isLoading, setIsLoading] = useState(false);

    const handleLogout = async () => {
        try {
            setIsLoading(true);
            await signOut(auth);
        } catch (error) {
            console.error('Error signing out:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatementAnalyzed = (result) => {
        // Recargar datos del dashboard cuando se analiza un nuevo estado de cuenta
        console.log('Nuevo estado de cuenta analizado:', result);
        // NO cambiar automáticamente al dashboard - permitir que el usuario revise y corrija categorías
        // setCurrentView('dashboard'); // Comentado para permitir correcciones inmediatas
        // El dashboard se actualizará automáticamente cuando el usuario navegue manualmente
    };

    const renderView = () => {
        switch (currentView) {
            case 'dashboard':
                return <FinanceDashboard db={db} user={user} appId={appId} />;
            case 'cards':
                return <CreditCardManager db={db} user={user} appId={appId} />;
            case 'analyzer':
                return <PDFStatementAnalyzer 
                    db={db} 
                    user={user} 
                    appId={appId} 
                    onStatementAnalyzed={handleStatementAnalyzed}
                    onNavigateToDashboard={() => setCurrentView('dashboard')}
                />;
            case 'statements':
                return <StatementsView db={db} user={user} appId={appId} />;
            default:
                return <FinanceDashboard db={db} user={user} appId={appId} />;
        }
    };

    const getNavButtonClass = (view) => {
        return `flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
            currentView === view
                ? 'bg-green-600 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`;
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center mr-3">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                                        </svg>
                                    </div>
                                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">FinanzApp</h1>
                                </div>
                            </div>
                        </div>

                        {/* Navigation */}
                        <nav className="hidden md:flex space-x-1">
                            <button
                                onClick={() => setCurrentView('dashboard')}
                                className={getNavButtonClass('dashboard')}
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Dashboard
                            </button>
                            <button
                                onClick={() => setCurrentView('cards')}
                                className={getNavButtonClass('cards')}
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                                Tarjetas
                            </button>
                            <button
                                onClick={() => setCurrentView('analyzer')}
                                className={getNavButtonClass('analyzer')}
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Analizar PDF
                            </button>
                            <button
                                onClick={() => setCurrentView('statements')}
                                className={getNavButtonClass('statements')}
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                </svg>
                                Estados de Cuenta
                            </button>
                        </nav>

                        {/* User menu */}
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                                <img
                                    className="h-8 w-8 rounded-full"
                                    src={user.photoURL}
                                    alt={user.displayName}
                                />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
                                    {user.displayName}
                                </span>
                            </div>
                            <button
                                onClick={handleLogout}
                                disabled={isLoading}
                                className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                            >
                                {isLoading ? 'Cerrando...' : 'Cerrar Sesión'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile navigation */}
                <div className="md:hidden border-t border-gray-200 dark:border-gray-700">
                    <div className="flex space-x-1 p-2">
                        <button
                            onClick={() => setCurrentView('dashboard')}
                            className={getNavButtonClass('dashboard')}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setCurrentView('cards')}
                            className={getNavButtonClass('cards')}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setCurrentView('analyzer')}
                            className={getNavButtonClass('analyzer')}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {renderView()}
            </main>
        </div>
    );
};

// --- Componente Principal ---
export default function App() {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleGoogleSignIn = async () => {
        try {
            setIsLoading(true);
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error('Error signing in with Google:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
        );
    }

    if (!user) {
        return <LoginScreen onGoogleSignIn={handleGoogleSignIn} />;
    }

    return <FinanceApp user={user} />;
}




