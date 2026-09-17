"use client";

import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { HistoricalClimateForm } from './historical-climate-form';
import { ClimateProfileSummary } from './climate-profile-summary';
import { ClimateFileDropzone } from './climate-file-dropzone';
import { DataValidationSummary } from './data-validation-summary';

export function ClimateSourceTabs() {
  const [activeTab, setActiveTab] = useState<'historical' | 'upload'>('historical');

  return (
    <Tabs>
      <TabsList>
        <TabsTrigger 
          isActive={activeTab === 'historical'} 
          icon="history_edu"
          onClick={() => setActiveTab('historical')}
        >
          Usar Dados Históricos ONS/ERA5
        </TabsTrigger>
        <TabsTrigger 
          isActive={activeTab === 'upload'} 
          icon="cloud_upload"
          onClick={() => setActiveTab('upload')}
        >
          Carregar Cenário Próprio (Upload CSV/XLSX)
        </TabsTrigger>
      </TabsList>

      <TabsContent isActive={activeTab === 'historical'}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-7">
            <HistoricalClimateForm />
          </div>
          <div className="lg:col-span-5">
            <ClimateProfileSummary />
          </div>
        </div>
      </TabsContent>

      <TabsContent isActive={activeTab === 'upload'}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <div className="lg:col-span-6 flex flex-col h-full">
            <ClimateFileDropzone />
          </div>
          <div className="lg:col-span-6 flex flex-col h-full">
            <DataValidationSummary />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
